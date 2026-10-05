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
app.get('/debug/:code', (req, res) => {
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
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
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
    cardBack: null,
    status: 'waiting', // waiting | game
    hostId: socketId,
    players: [{ id: socketId, name, avatar, isBot: false, connected: true }],
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
  room.aiTimer = null
  room.roundTimer = null
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
    cardBack: room.cardBack,
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
    room: { code: room.code, decks: room.decks, cardBack: room.cardBack, hostId: room.hostId },
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
    if (sock) sock.emit('game:snap', snapshot(room, p.id))
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
  broadcastGame(room)
  const phase = room.game?.phase
  if (phase === 'bid') scheduleBot(room)
  else if (phase === 'roundEnd') scheduleRoundEnd(room)
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
  const loser = g.players.find((p) => p.id === g.lastRoundLoserId)
  // bots (and disconnected players) start the next round after 5 s,
  // a human loser gets 10 s and may click through earlier
  const delay = room.goClicked
    ? 5000
    : !loser || loser.isBot || loser.connected === false
      ? 5000
      : 10000
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

  if (action.type === 'NEXT_ROUND') {
    // fast path: only the loser may trigger it, once, shrinking the wait to 5 s
    if (g.phase !== 'roundEnd' || pid !== g.lastRoundLoserId) return false
    if (!room.goClicked) {
      room.goClicked = true
      logEvent(room, 'fast-click')
      clearTimeout(room.roundTimer)
      room.roundTimer = setTimeout(() => advanceRound(room), 5000)
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

function normalizeBack(v) {
  if (!v || typeof v !== 'object') return null
  const kind = v.kind === 'url' ? 'url' : 'preset'
  const value = typeof v.value === 'string' ? v.value.slice(0, 500000) : ''
  if (!value) return null
  return { kind, value }
}

const roomOf = (socket) => (socket.data.code ? rooms.get(socket.data.code) : null)

// ---------- socket handlers ----------
io.on('connection', (socket) => {
  socket.on('table:create', (payload = {}, ack) => {
    const name = cleanName(payload.name)
    if (!name) return ack?.({ ok: false, err: 'Wpisz swój nick!' })
    if (roomOf(socket)) return ack?.({ ok: false, err: 'Jesteś już przy innym stole' })
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
    ack?.({ ok: true, youId: socket.id, room: { code, decks: room.decks, cardBack: room.cardBack } })
  })

  socket.on('table:join', (payload = {}, ack) => {
    const code = String(payload.code || '').trim().toUpperCase()
    const name = cleanName(payload.name)
    if (!name) return ack?.({ ok: false, err: 'Wpisz swój nick!' })
    if (!/^[A-Z0-9]{3,8}$/.test(code)) return ack?.({ ok: false, err: 'Nieprawidłowy kod stołu' })
    if (roomOf(socket)) return ack?.({ ok: false, err: 'Jesteś już przy innym stole' })

    const room = rooms.get(code)
    if (!room) return ack?.({ ok: false, err: 'Nie ma takiego stołu' })
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

    room.players.push({ id: socket.id, name, avatar: cleanAvatar(payload.avatar), isBot: false, connected: true })
    socket.data.code = code
    socket.join(roomKey(code))
    ack?.({ ok: true, youId: socket.id, room: { code, decks: room.decks, cardBack: room.cardBack } })
    broadcastTable(room)
  })

  socket.on('table:sync', (_payload, ack) => {
    const room = roomOf(socket)
    if (!room) return ack?.({ ok: false, err: 'Nie jesteś przy stole' })
    ack?.({ ok: true, table: publicTable(room) })
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
    if (room.status !== 'waiting') return fail('Gra już trwa')

    if (payload.decks === 1 || payload.decks === 2) {
      if (payload.decks === 1 && room.players.length > 5) {
        return fail('Najpierw usuń graczy - na 1 talii jest 5 miejsc')
      }
      room.decks = payload.decks
    }
    if (payload.cardBack !== undefined) room.cardBack = normalizeBack(payload.cardBack)
    broadcastTable(room)
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
      { code: room.code, decks: room.decks, cardBack: room.cardBack },
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
    if (room.players.length === 0) return destroyRoom(room)
    if (wasHost) {
      const nextHuman = room.players.find((p) => !p.isBot) || room.players[0]
      room.hostId = nextHuman.id
    }
    broadcastTable(room)
    return
  }

  // mid-game: an explicit leave or a dropped connection both hand the seat
  // over to the AI - but the last human leaving ends the whole table
  const p = room.players[idx]
  if (!p.isBot) {
    const otherHumans = room.players.filter((x) => !x.isBot && x.connected !== false && x.id !== p.id)
    if (otherHumans.length === 0) {
      destroyRoom(room)
      return
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
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Blef server ready on http://localhost:${PORT}`)
})
httpServer.on('error', (e) => console.error('Server error:', e))
process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r))
process.on('uncaughtException', (e) => console.error('Uncaught exception:', e))
