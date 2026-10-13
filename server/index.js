// ============================================================
// Blef - game server (Express + Socket.io)
//
// The server is authoritative: it runs the same engine the client
// uses (client/src/lib/game.js) and sends every player a sanitized
// snapshot of the game - nobody can see an opponent's hand.
// ============================================================
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { existsSync } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

import { initGame, reducer, chooseAiAction } from '../client/src/lib/game.js'
import { BOTS } from '../client/src/lib/bots.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '1mb' }))

// read-only state dump for debugging (no secrets, hands stay out of it)
app.get(['/debug/:code', '/blef/debug/:code'], (req, res) => {
  const room = rooms.get(String(req.params.code || '').toUpperCase())
  if (!room) return res.status(404).json({ err: 'no room' })
  const g = room.game
  res.json({
    status: room.status,
    decks: room.decks,
    goClicked: room.goClicked,
    players: room.players.map((p) => ({ id: p.id.slice(0, 6), name: p.name, bot: !!p.isBot, conn: p.connected !== false })),
    log: (room.log || []).slice(-20),
    game: g && {
      phase: g.phase,
      round: g.round,
      turn: g.players[g.turnIndex]?.name,
      lastRoundLoserId: g.lastRoundLoserId?.slice(0, 6),
      bid: g.currentBid && { c: g.currentBid.count, v: g.currentBid.value, by: g.currentBid.playerName },
      counts: g.players.map((p) => `${p.name}:${p.cardsCount}${p.isEliminated ? 'X' : ''}`),
      history: g.history.slice(-8).map((h) => h.text),
    },
  })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  path: process.env.SOCKET_PATH || '/blef/socket.io',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6, // card decks are personal (client-side) - payloads stay small
})

// ---------- rooms ----------
const rooms = new Map() // code -> room
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I/O/0/1

function genCode() {
  for (;;) {
    let code = ''
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
}

const seatCountFor = (room) => (room.decks === 2 ? 10 : 5)
const roomKey = (code) => `table:${code}`

// ring buffer of recent timing events - visible via GET /debug/:code
function logEvent(room, e) {
  room.log = room.log || []
  room.log.push({ t: Date.now(), e })
  if (room.log.length > 60) room.log.shift()
}

function createRoom({ code, password, name, avatar, socketId }) {
  const room = {
    code,
    password: password || '',
    decks: 1,
    status: 'waiting', // waiting | game
    hostId: socketId,
    players: [{ id: socketId, name, avatar, isBot: false, connected: true, token: randomBytes(16).toString('hex'), lastAlive: Date.now() }],
    game: null,
    aiTimer: null,
    roundTimer: null,
    goClicked: false,
  }
  rooms.set(code, room)
  return room
}

function clearTimers(room) {
  clearTimeout(room.aiTimer)
  clearTimeout(room.roundTimer)
  clearTimeout(room.destroyTimer)
  room.aiTimer = null
  room.roundTimer = null
  room.destroyTimer = null
}

function destroyRoom(room) {
  clearTimers(room)
  rooms.delete(room.code)
}

function publicTable(room) {
  return {
    code: room.code,
    hasPassword: !!room.password,
    decks: room.decks,
    status: room.status,
    hostId: room.hostId,
    seatCount: seatCountFor(room),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: !!p.isBot,
      connected: p.connected !== false,
    })),
  }
}

function broadcastTable(room) {
  io.to(roomKey(room.code)).emit('table:update', publicTable(room))
}

// success answer for table:create / table:join - includes the seat token
// (the client stores it so the same player can rejoin, even mid-game) and
// everything needed to jump straight back into a running game.
function tableAck(room, socket) {
  const seat = room.players.find((p) => p.id === socket.id)
  return {
    ok: true,
    youId: socket.id,
    token: (seat && seat.token) || '',
    room: {
      code: room.code,
      decks: room.decks,
      status: room.status,
      players: publicTable(room).players,
    },
  }
}

// ---------- game snapshots (per player, secrets stripped) ----------
function snapshot(room, pid) {
  const g = room.game
  if (!g) return null

  let checkResult = null
  if (g.checkResult) {
    const cr = g.checkResult
    // the engine only stores names for winners - derive ids for a per-player answer
    const winnerId = cr.found >= cr.bid.count ? cr.bid.playerId : cr.challengerId
    checkResult = {
      endsAt: room.roundEndsAt || 0, // countdown deadline the client mirrors
      ...cr,
      loserIsYou: cr.loserId === pid,
      winnerIsYou: winnerId === pid,
      gameWinnerIsYou: !!cr.gameWinnerId && cr.gameWinnerId === pid,
      hands: cr.hands.map((h) => ({ ...h, isYou: h.id === pid })),
    }
    delete checkResult.gameWinnerId
  }

  return {
    ...g,
    room: { code: room.code, decks: room.decks, hostId: room.hostId },
    deck: new Array(g.deck.length).fill(null), // length only - no values
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isBot: !!p.isBot,
      connected: p.connected !== false,
      cardsCount: p.cardsCount,
      isEliminated: p.isEliminated,
      isYou: p.id === pid,
      hand: p.id === pid ? p.hand : [], // everyone else's hand stays hidden
    })),
    checkResult,
  }
}

function broadcastGame(room) {
  for (const p of room.players) {
    if (p.isBot) continue
    const sock = io.sockets.sockets.get(p.id)
    // only sockets still sitting at THIS table get the snapshot - a player who
    // left (their seat id stays for the rejoin) must not feed stale state to
    // whatever new game they are in now
    if (sock && sock.rooms.has(roomKey(room.code))) sock.emit('game:snap', snapshot(room, p.id))
  }
}

// ---------- engine driver ----------
function finalize(room) {
  // gameOver results carry a winner name only - store the id too
  const g = room.game
  if (g && g.phase === 'gameOver' && g.checkResult && !g.checkResult.gameWinnerId) {
    const w = g.players.find((p) => !p.isEliminated)
    if (w) g.checkResult.gameWinnerId = w.id
  }
}

function afterAction(room) {
  finalize(room)
  const phase = room.game?.phase
  // timers FIRST: the round deadline must exist before the snapshot goes out,
  // otherwise clients mirror a stale deadline (the "auto za 0s" bug)
  if (phase === 'bid') scheduleBot(room)
  else if (phase === 'roundEnd') scheduleRoundEnd(room)
  broadcastGame(room)
}

function scheduleBot(room) {
  clearTimeout(room.aiTimer)
  const g = room.game
  if (!g || g.phase !== 'bid') return
  const cur = g.players[g.turnIndex]
  const aiControls = cur.isBot || cur.connected === false
  if (!aiControls) return

  room.aiTimer = setTimeout(() => {
    const st = room.game
    if (!st || st.phase !== 'bid') return
    const p = st.players[st.turnIndex]
    if (!(p.isBot || p.connected === false)) return
    let action = chooseAiAction(st)
    // safety net: if the chosen move would change nothing, force a legal fallback
    if (reducer(st, action) === st) {
      action = st.currentBid ? { type: 'CHECK' } : { type: 'BID', count: 2, value: '2' }
    }
    const next = reducer(st, action)
    if (next !== st) {
      room.game = next
      afterAction(room)
    }
  }, 1300 + Math.floor(Math.random() * 900))
}

function scheduleRoundEnd(room) {
  clearTimeout(room.roundTimer)
  const g = room.game
  if (!g || g.phase !== 'roundEnd') return
  // without a click everyone advances after 10 s (the verdict screen shows
  // 8 of them - the first 2 s are the card reveal); the loser's "Następna
  // runda" click shrinks the wait to 2 s
  const delay = room.goClicked ? 2000 : 10000
  room.roundEndsAt = Date.now() + delay // countdown deadline for the clients
  logEvent(room, `schedule:${delay}`)
  room.roundTimer = setTimeout(() => advanceRound(room), delay)
}

function advanceRound(room) {
  clearTimeout(room.roundTimer)
  const g = room.game
  if (!g || g.phase !== 'roundEnd') return
  room.goClicked = false
  logEvent(room, 'advance')
  room.game = reducer(g, { type: 'NEXT_ROUND' })
  afterAction(room)
}

// apply a player action with a full turn/phase guard
function applyAction(room, pid, action) {
  const g = room.game
  if (!g || !action || typeof action !== 'object') return false
  const actor = room.players.find((x) => x.id === pid)
  if (actor) actor.lastAlive = Date.now() // an action is the loudest proof of life

  if (action.type === 'NEXT_ROUND') {
    // fast path: only the loser may trigger it, once, shrinking the wait to 2 s
    if (g.phase !== 'roundEnd' || pid !== g.lastRoundLoserId) return false
    if (!room.goClicked) {
      room.goClicked = true
      logEvent(room, 'fast-click')
      scheduleRoundEnd(room) // 2 s window, new deadline for everyone
      io.to(roomKey(room.code)).emit('round:go', room.roundEndsAt)
    }
    return true
  }

  if (action.type === 'RESTART') {
    if (g.phase !== 'gameOver' || pid !== room.hostId) return false
    const next = reducer(g, action)
    if (next === g) return false
    logEvent(room, 'restart')
    room.game = next
    afterAction(room)
    return true
  }

  if (action.type !== 'BID' && action.type !== 'CHECK') return false
  if (g.phase !== 'bid') return false
  const cur = g.players[g.turnIndex]
  if (!cur || cur.id !== pid) return false // not your turn
  if (cur.connected === false) return false // AI plays disconnected seats

  const next = reducer(g, action)
  if (next === g) return false // illegal bid
  logEvent(room, `${action.type}:${pid.slice(0, 4)}`)
  room.game = next
  afterAction(room)
  return true
}

// ---------- validation helpers ----------
const cleanName = (v) => (typeof v === 'string' ? v.trim().slice(0, 14) : '')
const cleanAvatar = (v) => (typeof v === 'string' ? v.slice(0, 200000) : '')
const cleanPassword = (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : '')

const roomOf = (socket) => (socket.data.code ? rooms.get(socket.data.code) : null)

// Point every id reference in a running game at the reconnected socket, so a
// returning player keeps their bids, their turn, their check result and the
// "only the loser may advance" rule - everything keyed by seat id.
function rebindGameIds(game, oldId, newId) {
  if (!game) return
  const gp = game.players.find((p) => p.id === oldId)
  if (gp) {
    gp.id = newId
    gp.connected = true
  }
  if (game.currentBid && game.currentBid.playerId === oldId) game.currentBid.playerId = newId
  if (game.lastRoundLoserId === oldId) game.lastRoundLoserId = newId
  const cr = game.checkResult
  if (cr) {
    if (cr.loserId === oldId) cr.loserId = newId
    if (cr.challengerId === oldId) cr.challengerId = newId
    if (cr.gameWinnerId === oldId) cr.gameWinnerId = newId
    const h = cr.hands.find((x) => x.id === oldId)
    if (h) h.id = newId
  }
}

// Hand the old seat back to the returning player (fresh socket id) and push
// everyone a fresh snapshot so the rejoiner sees the current state at once.
function reattachSeat(room, seat, socket) {
  const oldId = seat.id
  // a live older tab still holding the seat gets politely cut off (a dead
  // socket from a reload is simply gone and lands here too)
  const oldSock = io.sockets.sockets.get(oldId)
  if (oldSock && oldSock.id !== socket.id) {
    oldSock.data.code = null
    oldSock.leave(roomKey(room.code))
    oldSock.emit('err', 'Ten stół otworzyłeś w innej karcie')
    oldSock.emit('kicked') // that tab returns to the menu instead of showing a frozen table
  }
  seat.id = socket.id
  seat.connected = true
  seat.lastAlive = Date.now()
  socket.data.code = room.code
  socket.join(roomKey(room.code))
  if (room.hostId === oldId) room.hostId = socket.id
  rebindGameIds(room.game, oldId, socket.id)
  clearTimeout(room.aiTimer)
  room.aiTimer = null
  clearTimeout(room.destroyTimer) // the player is back - no cleanup
  room.destroyTimer = null
  logEvent(room, 'rejoin')
  broadcastTable(room)
  broadcastGame(room) // straight to the returning player too
  scheduleBot(room) // only fires for bot/disconnected seats
  scheduleRoundEnd(room) // a waiting roundEnd keeps its normal 8 s window
}

// The sweeper handed this seat to the AI (the tab was silent too long), but the
// same socket just pinged back - the player is home again, take the seat back.
function reviveSeat(room, p) {
  p.connected = true
  if (room.game) {
    const gp = room.game.players.find((x) => x.id === p.id)
    if (gp) gp.connected = true
  }
  clearTimeout(room.destroyTimer) // a human is back - no cleanup
  room.destroyTimer = null
  logEvent(room, 'alive-revive')
  broadcastTable(room)
  broadcastGame(room)
  scheduleBot(room)
  scheduleRoundEnd(room)
}

// ---------- socket handlers ----------
io.on('connection', (socket) => {
  socket.on('table:create', (payload = {}, ack) => {
    const name = cleanName(payload.name)
    if (!name) return ack?.({ ok: false, err: 'Wpisz swój nick!' })
    // a stale binding (e.g. an old lobby we never really left) must not block
    // creating a fresh table - leaving first is exactly what the player means
    if (roomOf(socket)) handleLeave(socket)
    const code = genCode()
    const room = createRoom({
      code,
      password: cleanPassword(payload.password),
      name,
      avatar: cleanAvatar(payload.avatar),
      socketId: socket.id,
    })
    socket.data.code = code
    socket.join(roomKey(code))
    ack?.(tableAck(room, socket))
  })

  socket.on('table:join', (payload = {}, ack) => {
    const code = String(payload.code || '').trim().toUpperCase()
    const name = cleanName(payload.name)
    if (!name) return ack?.({ ok: false, err: 'Wpisz swój nick!' })
    if (!/^[A-Z0-9]{3,8}$/.test(code)) return ack?.({ ok: false, err: 'Nieprawidłowy kod stołu' })

    const room = rooms.get(code)
    if (!room) return ack?.({ ok: false, err: 'Nie ma takiego stołu' })

    // heading to another table drops any stale binding (and its socket room)
    // first, so one socket is ever in a single table room
    const current = roomOf(socket)
    if (current && current.code !== code) handleLeave(socket)

    // --- returning player: the stored seat token gives the seat back, mid-game
    // too (a reload or a dropped connection no longer locks anyone out). The
    // same nickname works as well - e.g. cleared browser storage or another
    // device - while a password-protected table still demands its password on
    // that path (the token path is proof enough on its own).
    const byName = (p) => !p.isBot && p.name.toLowerCase() === name.toLowerCase()
    const tokenSeat = room.players.find((p) => byName(p) && p.token && p.token === payload.token)
    const nameSeat =
      !room.password || room.password === cleanPassword(payload.password)
        ? room.players.find(byName)
        : null
    const seat = tokenSeat || nameSeat
    if (seat) {
      reattachSeat(room, seat, socket)
      return ack?.(tableAck(room, socket))
    }

    if (current && current.code === code) return ack?.({ ok: false, err: 'Jesteś już przy tym stole' })
    if (room.status !== 'waiting') return ack?.({ ok: false, err: 'Gra już trwa' })
    if (room.password && room.password !== cleanPassword(payload.password)) {
      return ack?.({ ok: false, err: 'Złe hasło stołu' })
    }
    if (room.players.length >= seatCountFor(room)) {
      return ack?.({ ok: false, err: 'Brak wolnych miejsc' })
    }
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return ack?.({ ok: false, err: 'Ten nick jest zajęty' })
    }

    room.players.push({
      id: socket.id,
      name,
      avatar: cleanAvatar(payload.avatar),
      isBot: false,
      connected: true,
      token: randomBytes(16).toString('hex'),
      lastAlive: Date.now(),
    })
    socket.data.code = code
    socket.join(roomKey(code))
    ack?.(tableAck(room, socket))
    broadcastTable(room)
  })

  socket.on('table:sync', (_payload, ack) => {
    const room = roomOf(socket)
    if (!room) return ack?.({ ok: false, err: 'Nie jesteś przy stole' })
    ack?.({ ok: true, table: publicTable(room) })
  })

  // proof of life from a tab that is still open - keeps the seat away from the
  // AI (silence > 45 s hands it over), and a ping after that takes it back
  socket.on('seat:alive', () => {
    const room = roomOf(socket)
    if (!room) return
    const p = room.players.find((x) => x.id === socket.id)
    if (!p || p.isBot) return
    p.lastAlive = Date.now()
    if (p.connected === false) reviveSeat(room, p)
  })

  socket.on('table:leave', () => {
    handleLeave(socket)
  })

  socket.on('table:settings', (payload = {}, ack) => {
    const fail = (msg) => {
      ack?.({ ok: false, err: msg })
      socket.emit('err', msg)
    }
    const room = roomOf(socket)
    if (!room) return fail('Nie jesteś przy stole')
    if (room.hostId !== socket.id) return fail('Ustawienia zmienia gospodarz')

    if (payload.decks === 1 || payload.decks === 2) {
      if (room.status !== 'waiting') return fail('Liczby talii nie zmienisz w trakcie gry')
      if (payload.decks === 1 && room.players.length > 5) {
        return fail('Najpierw usuń graczy - na 1 talii jest 5 miejsc')
      }
      room.decks = payload.decks
      broadcastTable(room)
    }
    ack?.({ ok: true })
  })

  socket.on('table:addBot', (_payload, ack) => {
    const room = roomOf(socket)
    if (!room || room.hostId !== socket.id) return ack?.({ ok: false, err: 'Tylko gospodarz dodaje boty' })
    if (room.status !== 'waiting') return ack?.({ ok: false, err: 'Gra już trwa' })
    if (room.players.length >= seatCountFor(room)) return ack?.({ ok: false, err: 'Brak wolnych miejsc' })
    const taken = new Set(room.players.map((p) => p.id))
    const bot = BOTS.find((b) => !taken.has(b.id))
    if (!bot) return ack?.({ ok: false, err: 'Wszystkie boty są zajęte' })
    room.players.push({ ...bot, isBot: true, connected: true })
    broadcastTable(room)
    ack?.({ ok: true })
  })

  socket.on('table:removeBot', (payload = {}, ack) => {
    const room = roomOf(socket)
    if (!room || room.hostId !== socket.id) return ack?.({ ok: false, err: 'Tylko gospodarz usuwa boty' })
    if (room.status !== 'waiting') return ack?.({ ok: false, err: 'Gra już trwa' })
    const idx = room.players.findIndex((p) => p.isBot && p.id === payload.id)
    if (idx < 0) return ack?.({ ok: false, err: 'Nie ma takiego bota' })
    room.players.splice(idx, 1)
    broadcastTable(room)
    ack?.({ ok: true })
  })

  socket.on('table:start', (_payload, ack) => {
    const room = roomOf(socket)
    if (!room || room.hostId !== socket.id) return ack?.({ ok: false, err: 'Tylko gospodarz zaczyna grę' })
    if (room.status !== 'waiting') return ack?.({ ok: false, err: 'Gra już trwa' })
    if (room.players.length < 2) return ack?.({ ok: false, err: 'Potrzebni są chociaż 2 gracze' })

    room.status = 'game'
    room.goClicked = false
    // host flagged as "me" so the turn ring starts at the host, clockwise
    const roster = room.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, isBot: !!p.isBot, connected: p.connected !== false,
      isYou: p.id === socket.id
    }))
    room.game = initGame(
      null,
      { code: room.code, decks: room.decks },
      roster
    )
    broadcastTable(room) // Lobby switches to the game screen on this
    afterAction(room) // sends the first snapshot + schedules bots if needed
    ack?.({ ok: true })
  })

  socket.on('game:sync', (_payload, ack) => {
    const room = roomOf(socket)
    if (!room || room.status !== 'game') return ack?.({ ok: false, err: 'Nie ma gry' })
    ack?.({ ok: true, state: snapshot(room, socket.id) })
  })

  socket.on('game:action', (payload = {}, ack) => {
    const room = roomOf(socket)
    if (!room || room.status !== 'game') return ack?.({ ok: false, err: 'Nie ma gry' })
    // applyAction broadcasts the new snapshot itself when the state changes
    const applied = applyAction(room, socket.id, payload.action)
    if (!applied) return ack?.({ ok: false, err: 'Ten ruch nie jest teraz możliwy' })
    ack?.({ ok: true })
  })

  socket.on('disconnect', () => handleLeave(socket))
})

// A tab can look connected while its page is frozen (phone screen off, laptop
// asleep) - the table would then wait forever for a player who is not home.
// Clients ping every 12 s; a human silent for 45 s is handed over to the AI
// and gets the "no connection" badge - and a ping later takes the seat back.
setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) {
    if (room.status !== 'game') continue
    for (const p of room.players) {
      if (p.isBot || p.connected === false) continue
      if (!p.lastAlive || now - p.lastAlive <= 45000) continue
      p.connected = false
      if (room.game) {
        const gp = room.game.players.find((x) => x.id === p.id)
        if (gp) gp.connected = false
      }
      if (room.hostId === p.id) {
        const nextHuman = room.players.find((x) => !x.isBot && x.connected !== false)
        if (nextHuman) room.hostId = nextHuman.id
      }
      logEvent(room, `stale-seat:${p.name}`)
      broadcastTable(room)
      broadcastGame(room)
      scheduleBot(room)
      scheduleRoundEnd(room)
    }
  }
}, 10000)

function handleLeave(socket) {
  const room = roomOf(socket)
  if (!room) return
  socket.data.code = null
  socket.leave(roomKey(room.code))

  const idx = room.players.findIndex((p) => p.id === socket.id)
  if (idx < 0) return
  const wasHost = room.hostId === socket.id

  if (room.status === 'waiting') {
    room.players.splice(idx, 1)
    // a waiting table without a single human is pointless (it would sit there
    // full of bots forever) - drop it entirely
    if (!room.players.some((p) => !p.isBot)) return destroyRoom(room)
    if (wasHost) {
      const nextHuman = room.players.find((p) => !p.isBot) || room.players[0]
      room.hostId = nextHuman.id
    }
    broadcastTable(room)
    return
  }

  // mid-game: an explicit leave or a dropped connection both hand the seat
  // over to the AI - but the last human leaving gives everyone a moment:
  // the table survives 90 s (reload, network blip) before it is cleaned up
  const p = room.players[idx]
  if (!p.isBot) {
    const otherHumans = room.players.filter((x) => !x.isBot && x.connected !== false && x.id !== p.id)
    if (otherHumans.length === 0) {
      clearTimeout(room.destroyTimer)
      // the victory/defeat screen deserves to stay up while the grace runs;
      // clients reconnect and rejoin forever (no attempt cap), so a player
      // who wanders off mid-result screen comes back into the same room
      room.destroyTimer = setTimeout(() => {
        if (!room.players.some((x) => !x.isBot && x.connected !== false)) destroyRoom(room)
      }, 90000)
      logEvent(room, 'last-human-left:90s-grace')
    }
  }
  p.connected = false
  if (room.game) {
    // the engine keeps its own player list - flag the seat there too so the AI takes over
    const gp = room.game.players.find((x) => x.id === p.id)
    if (gp) gp.connected = false
  }
  if (wasHost) {
    const nextHuman = room.players.find((x) => !x.isBot && x.connected !== false)
    if (nextHuman) room.hostId = nextHuman.id
  }
  broadcastTable(room)
  broadcastGame(room)
  scheduleBot(room) // if the leaver had the move, AI takes over now
  scheduleRoundEnd(room) // a disconnected loser only gets 5 s instead of 10
}

// ---------- production: serve the built client (vite outDir is ../dist) ----------
const dist = path.join(__dirname, '..', 'dist')
if (existsSync(dist)) {
  app.use('/blef', express.static(dist))
  app.use(express.static(dist))
  app.get(['/blef', '/blef/*', '*'], (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Blef server ready on http://localhost:${PORT}`)
})
httpServer.on('error', (e) => console.error('Server error:', e))
process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r))
process.on('uncaughtException', (e) => console.error('Uncaught exception:', e))
