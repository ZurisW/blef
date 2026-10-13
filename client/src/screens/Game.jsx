import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { LogOut, Layers, CircleHelp, History as HistoryIcon, X, WifiOff, Settings as SettingsIcon } from 'lucide-react'
import PlayingCard from '../components/PlayingCard'
import Avatar from '../components/Avatar'
import BidGrid from '../components/BidGrid'
import History from '../components/History'
import CheckOverlay from '../components/CheckOverlay'
import HelpModal from '../components/HelpModal'
import SettingsModal from '../components/SettingsModal'
import { initGame, reducer, isLegal, legalMoves, chooseAiAction, activePlayers } from '../lib/game'
import { loadOptions } from '../lib/options'
import { uiScale } from '../lib/ui'
import { socket, emitAck } from '../lib/socket'
import { playTurnChime, setTurnFlash } from '../lib/notify'
import { DeckContext, getDeck as getSavedDeck } from '../lib/decks'

// Polska odmiana: 1 karta, 2-4 karty, 5+ kart (11-14 też kart)
function kartForm(n) {
  if (n === 1) return 'karta'
  const d = n % 10
  const h = n % 100
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'karty'
  return 'kart'
}

// Seat positions. Desktop: arc (small table) or two rows (big table).
// Phone: avatar+count block, at most 4 seats per row.
function seatPositions(n, narrow) {
  const arr = []
  if (n < 1) return arr
  if (narrow) {
    // 10-player special layout: 4 top, 4 right, 1 bottom-left
    if (n === 9) {
      for (let i = 0; i < 4; i++) arr.push({ left: (100 * (i + 0.5)) / 4, top: 15 })
      for (let i = 0; i < 4; i++) arr.push({ left: 88, top: 33 + i * 12 })
      arr.push({ left: 12, top: 80 })
      return arr
    }
    const counts = n <= 4 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)]
    const tops = counts.length === 1 ? [17] : [15, 82] // bottom row sits a bit lower
    counts.forEach((cnt, ri) => {
      for (let i = 0; i < cnt; i++) arr.push({ left: (100 * (i + 0.5)) / cnt, top: tops[ri] })
    })
    return arr
  }
  if (n <= 4) {
    const span = (180 * (n - 1)) / (n + 1) // same angles as the old formulas (n=4: 216-324)
    for (let i = 0; i < n; i++) {
      const deg = n === 1 ? 270 : 270 - span / 2 + (i * span) / (n - 1)
      const a = (deg * Math.PI) / 180
      arr.push({ left: 48 + 25 * Math.cos(a), top: 50 + 30 * Math.sin(a) })
    }
    return arr
  }
  const kTop = Math.ceil(n / 2)
  const kSide = n - kTop
  // top row: a shallow arc (21% leaves headroom so the fan never clips the scene edge)
  for (let i = 0; i < kTop; i++) {
    const left = kTop === 1 ? 50 : 15 + (i * 70) / (kTop - 1)
    arr.push({ left, top: 21 + (4 * Math.abs(left - 50)) / 35 })
  }
  // the rest go into the bottom corners, clear of the rows, your hand and the deck
  const compact = typeof window !== 'undefined' && window.innerWidth < 820
  const inX = compact ? 20 : 21
  const arc = (left) => Math.min(90, 85 + (4 * Math.abs(left - 50)) / 43) // bottom corners sit a bit lower
  const leftCount = Math.ceil(kSide / 2)
  const rightCount = kSide - leftCount
  const rightSlots = [100 - inX, 93].slice(0, rightCount) // from centre: 79, 93
  const leftSlots = [inX, 7].slice(0, leftCount) // from centre: 21, 7
  // ring order: right corner outside-in, then left corner inside-out
  for (const x of [...rightSlots].reverse()) arr.push({ left: x, top: arc(x) })
  for (const x of leftSlots) arr.push({ left: x, top: arc(x) })
  return arr
}

// Re-sort seats to clockwise order starting from my seat (bottom centre)
function seatsClockwise(seats) {
  return seats
    .map((s, i) => ({ i, k: ((((Math.atan2(s.top - 50, s.left - 50) * 180) / Math.PI) - 90) % 360 + 360) % 360 }))
    .sort((a, b) => a.k - b.k)
    .map((x) => seats[x.i])
}

// the player's saved card back (localStorage) - personal: every player
// picks their own backs for the whole table view
function loadPersonalBack() {
  try {
    const s = JSON.parse(localStorage.getItem('blef.lobby') || '{}')
    if (s.backKind === 'url' && (s.backUrl || '').trim()) return { kind: 'url', value: s.backUrl.trim() }
    return { kind: 'preset', value: s.backPreset || 'gold' }
  } catch {
    return { kind: 'preset', value: 'gold' }
  }
}

export default function Game({ profile, room, onExit }) {
  const online = !!profile?.online
  // local demo keeps a reducer; online the server pushes snapshots and we mirror them
  const boot = useMemo(() => {
    const roster =
      online && Array.isArray(profile?.players)
        ? profile.players.map((p) => ({ ...p, isYou: p.id === profile.youId }))
        : profile?.players
    return initGame(profile, room, roster)
  }, [])
  const [local, localDispatch] = useReducer(reducer, boot)
  const [remote, setRemote] = useState(null)
  // the player's own card faces and card back - personal customization,
  // everyone at the table renders the game their own way
  const [deck, setDeck] = useState(null)
  const [back, setBack] = useState(loadPersonalBack)
  // when the current check overlay must end (server deadline; 0 = local demo)
  const [roundEndsAt, setRoundEndsAt] = useState(0)
  const [selected, setSelected] = useState(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showOpts, setShowOpts] = useState(false) // settings gear in the top bar
  const [showPile, setShowPile] = useState(false)
  const [handOpen, setHandOpen] = useState(false) // phone: own hand expanded (otherwise only the tops show)
  // how many batch rows fit on the table (measured) and the biggest card size
  // that still fits them
  const [fit, setFit] = useState({ rows: 3, size: 'md', rowH: 80, cover: 0.5, avail: 0 })
  const [reveal, setReveal] = useState(null) // transient popup: cards just revealed by a rotation
  const batchesRef = useRef(null)
  // options are live: the in-game settings popup saves them and the game
  // re-reads them right away ('blef:options' event)
  const [opts, setOpts] = useState(loadOptions)
  useEffect(() => {
    const onOpts = () => setOpts(loadOptions())
    window.addEventListener('blef:options', onOpts)
    return () => window.removeEventListener('blef:options', onOpts)
  }, [])
  const cf = opts.compactFooter // shorter, stretched footer

  useEffect(() => {
    if (!online) return
    const onSnap = (s) => {
      // safety net: a snapshot from another table must never overwrite ours
      if (s.room && s.room.code !== room.code) return
      setRemote(s)
      setRoundEndsAt(s && s.checkResult ? s.checkResult.endsAt || 0 : 0)
    }
    // the loser clicked "Następna runda" - the server shrinks the wait to 2 s
    const onGo = (deadline) => setRoundEndsAt(deadline || 0)
    socket.on('game:snap', onSnap)
    socket.on('round:go', onGo)
    emitAck('game:sync').then((res) => {
      if (res.ok && res.state) onSnap(res.state)
    })
    return () => {
      socket.off('game:snap', onSnap)
      socket.off('round:go', onGo)
    }
  }, [online, room.code])

  // the player's own deck of card faces (IndexedDB) - personal: everyone
  // renders the table with their own cards, the server is not involved
  const loadDeck = () => {
    try {
      const name = JSON.parse(localStorage.getItem('blef.lobby') || '{}').deckName
      getSavedDeck(name || '')
        .then((d) => setDeck(d || null))
        .catch(() => setDeck(null))
    } catch {
      setDeck(null)
    }
  }
  useEffect(loadDeck, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // the settings popup swapped the personal deck / card back mid-game
    const onDeck = () => loadDeck()
    const onBack = (e) => {
      const b = e.detail || {}
      setBack({ kind: b.kind, value: b.kind === 'url' ? b.url : b.preset })
    }
    window.addEventListener('blef:deck', onDeck)
    window.addEventListener('blef:back', onBack)
    return () => {
      window.removeEventListener('blef:deck', onDeck)
      window.removeEventListener('blef:back', onBack)
    }
  }, [])

  const state = online ? remote || boot : local
  // who may change the table's deck / card back (same rule as the lobby)
  const isHostGame = !online || state.room?.hostId === profile?.youId

  // one funnel for every player action - server-authoritative in online mode
  const send = (action) => {
    if (online) emitAck('game:action', { action })
    else localDispatch(action)
  }

  // measure how many batch rows fit on the table and the biggest card size
  // for them: lg -> md -> sm. Root pixels (uiScale).
  useEffect(() => {
    const el = batchesRef.current
    if (!el) return
    const calc = () => {
      const s = uiScale()
      // the final (+5) batch wears a ring - reserve its 8px so it doesn't clip
      const batches = state.tableBatches
      const lastB = batches.length ? batches[batches.length - 1] : null
      const finalExtra = lastB && lastB.type === 'final' ? 8 : 0
      const space = Math.max(40, el.clientHeight - finalExtra)
      const w = window.innerWidth
      const target = w < 640 ? 2 : w < 1024 ? 3 : 4
      const sizes = [['lg', 112], ['md', 80], ['sm', 56]]
      let size = 'sm', rowH = 56 * s, cover = 0.75
      for (const [name, hpx] of sizes) {
        const h = hpx * s
        const strideNeed = target > 1 ? (space - h) / (target - 1) : h
        const coverNeed = 1 - strideNeed / h
        size = name
        rowH = h
        if (strideNeed > 0 && coverNeed <= 0.75) {
          cover = Math.min(0.75, Math.max(0.5, coverNeed))
          break
        }
        cover = 0.75 // this size needs max overlap - try a smaller size first
      }
      const stride = rowH * (1 - cover)
      // +0.05 so float rounding can't drop the last row when cover was derived exactly
      const rows = Math.max(1, Math.min(target, Math.floor((space - rowH) / stride + 0.05) + 1))
      setFit((prev) => {
        const next = { rows, size, rowH, cover, avail: el.clientHeight }
        return prev.rows === next.rows && prev.size === next.size && prev.rowH === next.rowH &&
          prev.cover === next.cover && prev.avail === next.avail ? prev : next
      })
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [state, handOpen])
  const [vh, setVh] = useState(typeof window !== 'undefined' ? window.innerHeight : 800)
  const [vw, setVw] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200)
  const narrow = vw < 640 // phone: fan replaced by a compact card-count badge
  const s = uiScale() // root-font-size multiplier for pixel math (see lib/ui.js)

  // track window size (short window = smaller hand cards)
  useEffect(() => {
    const onResize = () => {
      setVh(window.innerHeight)
      setVw(window.innerWidth)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // game timer (seconds elapsed since first round started)
  const [gameTimer, setGameTimer] = useState(0)
  useEffect(() => {
    if (state.phase === 'bid' && state.round > 0) {
      const id = setInterval(() => setGameTimer((t) => t + 1), 1000)
      return () => clearInterval(id)
    }
  }, [state.phase, state.round])

  // format seconds as HH:MM:SS
  const formatTimer = (sec) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  const you = state.players.find((p) => p.isYou)
  const current = state.players[state.turnIndex]
  const yourTurn = state.phase === 'bid' && current?.isYou
  const activeCount = activePlayers(state.players).length

  // turns until your turn (bid phase only)
  const turnsUntilYou = (() => {
    if (state.phase !== 'bid' || !yourTurn) {
      const youIdx = state.players.findIndex((p) => p.isYou)
      if (youIdx === -1) return null
      const active = activePlayers(state.players)
      const curActiveIdx = active.findIndex((p) => p.id === state.players[state.turnIndex]?.id)
      const youActiveIdx = active.findIndex((p) => p.isYou)
      if (curActiveIdx === -1 || youActiveIdx === -1) return null
      let diff = youActiveIdx - curActiveIdx
      if (diff <= 0) diff += active.length
      return diff
    }
    return 0
  })()

  const moves = useMemo(() => legalMoves(state.currentBid, state.maxCount), [state.currentBid, state.maxCount])

  // "Kupka" switch: ON = batch rows while they fit, then the readable pile
  // (rank corners visible at a glance, click = popup); OFF = cards spread
  // left to right, each showing its corner strip (~1/4 of the card)
  const pileMode = !!opts.pile
  const showPileOnly = pileMode && state.tableBatches.length > fit.rows
  const hiddenCards = state.tableCards

  // table geometry - in root pixels (cards scale with the root font size)
  const n = hiddenCards.length
  const availH = fit.avail || 130

  // readable pile: adaptive columns (~6 preferred), every row shows the whole
  // rank corner; lg cards when the stage is tall enough, md otherwise
  const pileLg = !narrow && availH >= 156 // 112 card + 8 padding + 36 corner strip
  const pcW = (pileLg ? 80 : 56) * s
  const pcH = (pileLg ? 112 : 80) * s
  const pstepXw = (pileLg ? 26 : 18) * s // shows the rank glyph of every card
  const pstepYw = (pileLg ? 36 : 26) * s // shows the whole rank corner of every row
  const maxRowsH = Math.max(1, Math.floor((availH - pcH - 8 * s) / pstepYw) + 1)
  const maxColsW = Math.max(4, Math.floor((vw * 0.92 - pcW - 8 * s) / pstepXw) + 1)
  // prefer a ~6 column stack, grow when the height demands more rows
  const pcols = Math.max(1, Math.min(Math.max(Math.min(6, n), Math.ceil(n / maxRowsH)), maxColsW))
  const prows = Math.max(1, Math.ceil(n / pcols))
  const pstepX = pstepXw
  const pstepY = prows > 1 ? Math.max(6 * s, Math.min(pstepYw, (availH - pcH - 8 * s) / (prows - 1))) : 0
  const pileW = (pcols - 1) * pstepX + pcW + 8 * s
  const pileH = (prows - 1) * pstepY + pcH + 8 * s

  // spread (pile OFF): lg cards from left to right, each covering the previous
  // one down to its corner strip; a second row covers the first ~3/4 from below
  const spW = 80 * s
  const spH = 112 * s
  const spStepX = 24 * s // keeps the corner strip (rank + suit) of every card visible
  const spCols = Math.max(1, Math.min(n, Math.floor((vw * 0.94 - spW - 8 * s) / spStepX) + 1))
  const spRows = Math.max(1, Math.ceil(n / spCols))
  const spStepY = spRows > 1 ? Math.max(spH * 0.16, Math.min(spH * 0.28, (availH - spH - 8 * s) / (spRows - 1))) : 0
  const spreadW = (spCols - 1) * spStepX + spW + 8 * s
  const spreadH = (spRows - 1) * spStepY + spH + 8 * s

  // batch rows are FULL width and stack top-down: a new row covers the one
  // above by half (up to 75% when space is tight - rank corners stay visible)
  const rowStride = fit.rowH * (1 - fit.cover)
  const rowMargin = rowStride - fit.rowH - 8 * s

  // ---- local demo AI: when it is someone else's turn, "think" then act ----
  useEffect(() => {
    if (online) return
    if (state.phase !== 'bid') return
    const cur = state.players[state.turnIndex]
    if (cur.isYou) return
    const timer = setTimeout(() => {
      let action = chooseAiAction(state)
      // safety net: a no-op move would freeze the game forever
      if (reducer(state, action) === state) {
        action = state.currentBid ? { type: 'CHECK' } : { type: 'BID', count: 2, value: '2' }
      }
      localDispatch(action)
    }, 1300)
    return () => clearTimeout(timer)
  }, [state, online])

  // ---- popup: cards revealed by a full rotation (Opcje dostępności > popup) ----
  const lastBatchesRef = useRef(null)
  useEffect(() => {
    const n = state.tableBatches?.length || 0
    const prev = lastBatchesRef.current
    lastBatchesRef.current = n
    // only a genuine +1 while playing - a reconnect snapshot can jump by many
    if (prev === null || n !== prev + 1) return
    const batch = state.tableBatches[n - 1]
    if (batch?.type === 'rotation' && opts.reveal) setReveal({ id: n, cards: batch.cards })
  }, [state.tableBatches, opts.reveal])

  useEffect(() => {
    if (!reveal) return
    const t = setTimeout(() => setReveal(null), 3200)
    return () => clearTimeout(t)
  }, [reveal])

  // ---- turn alerts (Opcje > "Alarm ruchu"): chime on your move + favicon blink ----
  // silenced while the check overlay owns the screen - no competing alerts
  const prevTurnRef = useRef(false)
  useEffect(() => {
    if (!opts.turnAlert) {
      prevTurnRef.current = yourTurn
      setTurnFlash(false)
      return
    }
    if (yourTurn && !prevTurnRef.current && !state.checkResult && (document.hidden || !document.hasFocus())) playTurnChime()
    prevTurnRef.current = yourTurn
    // blink only while the table is actually visible (no overlay covering it)
    setTurnFlash(yourTurn && !state.checkResult)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yourTurn, state.checkResult, opts.turnAlert])
  useEffect(() => () => setTurnFlash(false), []) // screen closed - icon back to normal

  const handleBid = () => {
    if (!selected || !isLegal(state.currentBid, selected.count, selected.value, state.maxCount)) return
    send({ type: 'BID', ...selected })
    setSelected(null)
  }

  const handleCheck = () => {
    if (!state.currentBid) return
    send({ type: 'CHECK' })
    setSelected(null)
  }

  // opponents rendered in ring order on seats sorted clockwise from me,
  // so the turn order always matches the picture on every layout
  const allPlayers = state.players
  const youIdx = allPlayers.findIndex((p) => p.isYou)
  const opponents =
    youIdx >= 0 ? [...allPlayers.slice(youIdx + 1), ...allPlayers.slice(0, youIdx)] : allPlayers
  const seats = seatsClockwise(seatPositions(opponents.length, narrow))
  const mid = (you.hand.length - 1) / 2
  // hand cards: md on the phone, lg when the hand is wide or the window is short,
  // xl otherwise - slightly bigger cards lying in front of you
  const handSize = narrow ? 'md' : you.hand.length > 4 ? 'lg' : vh < 760 * s ? 'lg' : 'xl'

  // online: wait for the first server snapshot before touching the table
  if (online && !remote) {
    return (
      <div className="h-[100dvh] felt flex items-center justify-center text-slate-300 font-semibold">
        Łączenie ze stołem&hellip;
      </div>
    )
  }

  return (
    <DeckContext.Provider value={deck}>
    <div className="h-[100dvh] felt flex flex-col overflow-hidden relative select-none">
      {/* ---------- Header ---------- */}
      <header className="flex items-center gap-3 sm:gap-5 px-3 sm:px-5 py-2 bg-slate-950/60 border-b border-amber-500/20 backdrop-blur z-30 shrink-0">
        <span className="text-lg sm:text-xl font-extrabold gold-text tracking-wider">BLEF</span>
        <span className="text-xs text-slate-300">Runda <b className="text-white">{state.round}</b></span>
        <span className="hidden sm:inline text-xs text-slate-300">
          {turnsUntilYou !== null && turnsUntilYou > 0 ? (
            <>
              Do Twojej tury: <b className="text-sky-300">{turnsUntilYou}</b>
            </>
          ) : yourTurn ? (
            <>
              <span className="text-amber-300 animate-pulse">Twój ruch</span>
            </>
          ) : (
            <>
              Okrążenie <b className="text-sky-300">{state.consecutiveBids}/{activeCount}</b>
            </>
          )}
        </span>
        <span className="text-xs text-slate-300 flex items-center gap-1.5">
          <Layers size={13} className="text-amber-300" /> <b className="text-white">{state.deck.length}</b>
        </span>
        <span className="hidden md:inline text-xs text-slate-300">
          Stół: <b className="text-white">{room.code}</b>
        </span>
        <div className="flex-1" />
        {/* Timer - top right, near control buttons */}
        <span className="text-xs text-slate-300 flex items-center gap-1 ml-2">
          <span className="w-4 h-4 rounded-full bg-amber-400/30 animate-pulse" />
          <b className="text-white font-mono">{formatTimer(gameTimer)}</b>
        </span>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className={`transition-colors ${showHistory ? 'text-amber-300' : 'text-slate-400 hover:text-amber-300'}`}
          title="Historia gry"
        >
          <HistoryIcon size={17} />
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="text-slate-400 hover:text-amber-300 transition-colors"
          title="Jak się gra?"
        >
          <CircleHelp size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowOpts(true)}
          className="text-slate-400 hover:text-amber-300 transition-colors"
          title="Ustawienia"
        >
          <SettingsIcon size={17} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (online) socket.emit('table:leave')
            onExit()
          }}
          className="text-slate-400 hover:text-white transition-colors"
          title="Opuść stół"
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* ---------- Table stage ---------- */}
      <main className="relative flex-1 min-h-0 overflow-hidden">
        {/* popup with the cards of a full rotation - top-left so it never blocks
            the centre; pointer-events-none, auto-hides */}
        {reveal && (
          <div key={reveal.id} className="absolute left-[calc(4%+2rem)] top-[10%] z-20 pop-in pointer-events-none">
            <div className="rounded-2xl border border-amber-400/40 bg-slate-950/90 backdrop-blur-sm shadow-2xl px-4 py-2.5 flex flex-col items-center gap-2">
              <div className="text-sm uppercase tracking-widest text-amber-200 whitespace-nowrap">
                Na stół trafia {reveal.cards.length} {kartForm(reveal.cards.length)}
              </div>
              <div className="flex gap-2.5">
                {reveal.cards.map((c, i) => (
                  <span key={c.id} className="deal-in inline-block" style={{ animationDelay: `${i * 70}ms` }}>
                    {/* big enough to read from across the room - xl on the desktop */}
                    <PlayingCard card={c} size={narrow ? 'lg' : 'xl'} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* deck (left edge) */}
        <div className="absolute left-[3%] sm:left-[4%] top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          <div className="relative w-14 sm:w-16 h-[7.375rem]">
            <PlayingCard faceDown size="lg" back={back} className="absolute top-1.5 left-1.5" />
            <PlayingCard faceDown size="lg" back={back} className="absolute top-0.5 left-0.5" />
            <PlayingCard faceDown size="lg" back={back} />
          </div>
          <div className="text-[0.6875rem] text-slate-300 bg-slate-950/70 rounded-full px-2 py-0.5 border border-white/10">
            {state.deck.length} {kartForm(state.deck.length)}
          </div>
        </div>

        {/* player seats */}
        {opponents.map((p, i) => {
          const isCurrent = state.phase === 'bid' && state.turnIndex === state.players.findIndex((x) => x.id === p.id)
          const seat = seats[i]
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10"
              style={{ left: `${seat.left}%`, top: `${seat.top}%` }}
            >
              {/* card backs fanned behind the avatar (phone: replaced by the count badge) */}
              <div className="relative">
                {!narrow &&
                  !p.isEliminated &&
                  Array.from({ length: Math.min(p.cardsCount, 6) }).map((_, k, arr) => {
                    const mid = (arr.length - 1) / 2
                    const angle = (k - mid) * 13
                    return (
                      <span
                        key={k}
                        className="absolute left-1/2 top-1/2 deal-in"
                        style={{
                          // bottoms meet just below the avatar centre - rotation
                          // around that point spreads the tops into a fan
                          translate: '-50% calc(-100% + 0.9375rem)',
                          transformOrigin: '50% 100%',
                          rotate: `${angle}deg`,
                          scale: '1.05',
                          animationDelay: `${k * 60}ms`,
                          zIndex: k,
                        }}
                      >
                        <PlayingCard faceDown size="md" back={back} />
                      </span>
                    )
                  })}

                {/* avatar */}
                <div
                  className={`relative z-10 rounded-full p-[0.1875rem] transition-all ${
                    p.isEliminated
                      ? 'bg-white/10 grayscale'
                      : isCurrent
                        ? 'bg-amber-400 animate-pulse-glow'
                        : 'bg-white/25'
                  }`}
                >
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-800 flex items-center justify-center text-lg sm:text-2xl ${p.isEliminated ? 'opacity-40' : ''}`}>
                    <Avatar value={p.avatar} className="w-full h-full text-lg sm:text-2xl" />
                  </div>
                  {isCurrent && !p.isEliminated && (
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[0.5625rem] font-bold bg-amber-400 text-slate-900 rounded-full px-1.5 py-px whitespace-nowrap">
                      TERAZ
                    </span>
                  )}
                </div>

                {/* card count badge: shows hand size near his avatar */}
                {(narrow || opts.bigCount) && !p.isEliminated && (
                  <span
                    className={`absolute z-20 font-bold text-slate-300 bg-slate-950/80 border border-white/15 rounded-full leading-none shadow ${
                      opts.bigCount ? 'text-sm sm:text-base px-2 py-0.5 border-white/25' : 'text-[0.625rem] px-1.5 py-px'
                    } ${narrow ? 'bottom-2 -right-2' : '-top-[10px] -right-[30px]'}`}
                  >
                    {'\u{1F0A0}'}&#215;{p.cardsCount}
                  </span>
                )}
                {/* dropped connection: red badge at the top left */}
                {p.connected === false && (
                  <span
                    title="Brak połączenia - chwilowo gra za tego prowadzi bot"
                    className="absolute -top-[5px] -left-[3px] z-20 rounded-full bg-red-500/90 p-1 shadow"
                  >
                    <WifiOff size={narrow ? 11 : 13} className="text-white" />
                  </span>
                )}
              </div>

              {/* nick; eliminated = grey avatar + red nick */}
              <div className={`flex items-center gap-1.5 mt-2 ${narrow ? 'max-w-[4.625rem]' : 'max-w-[6.875rem]'}`}>
                <span className={`text-[0.6875rem] sm:text-xs font-semibold truncate min-w-0 ${p.isEliminated ? 'text-red-400/90' : 'text-white'}`}>
                  {p.name}
                </span>
              </div>
            </div>
          )
        })}

        {/* centre: batch rows or just the pile + your hand "lying on the table" at the bottom */}
        <div className="absolute inset-x-0 top-[36%] bottom-0 flex flex-col items-center justify-end gap-1 px-2 pointer-events-none">
          <div
            ref={batchesRef}
            className={`flex-1 min-h-0 w-full flex flex-col items-center gap-2 overflow-hidden pointer-events-auto ${
              state.tableBatches.length === 0 || showPileOnly || !pileMode ? 'justify-center' : 'justify-start'
            }`}
          >
            {state.tableBatches.length === 0 ? (
              <div className="border-2 border-dashed border-white/15 rounded-xl px-4 py-2 text-[0.625rem] text-slate-300/70 text-center">
                Tu pojawią się karty ze stołu
              </div>
            ) : showPileOnly ? (
              /* too many rows - the readable pile (click = popup) */
              <>
                <button
                  type="button"
                  onClick={() => setShowPile(true)}
                  className="relative rounded-xl hover:scale-[1.05] active:scale-95 transition-transform"
                  style={{ width: pileW, height: pileH }}
                  title={`Karty na stole (${hiddenCards.length}) - kliknij, żeby zobaczyć`}
                >
                  {hiddenCards.map((c, i) => {
                    const col = i % pcols
                    const row = Math.floor(i / pcols)
                    const jx = ((i * 37) % 5) - 2
                    const jy = ((i * 53) % 3) - 1
                    const rot = ((i * 29) % 21) - 10
                    return (
                      <span
                        key={c.id}
                        className="absolute deal-in"
                        style={{
                          left: col * pstepX + jx,
                          top: row * pstepY + jy,
                          transform: `rotate(${rot}deg)`,
                          zIndex: i,
                          animationDelay: `${Math.min(i, 8) * 45}ms`,
                        }}
                      >
                        <PlayingCard card={c} size={pileLg ? 'lg' : 'md'} />
                      </span>
                    )
                  })}
                  <span className="absolute top-0.5 right-0.5 z-50 text-[0.625rem] font-bold bg-amber-400 text-slate-900 rounded-full px-1.5 py-0.5 shadow-md leading-none">
                    {hiddenCards.length}
                  </span>
                </button>
                <div className="text-[0.5625rem] text-slate-300/70">kliknij, żeby zobaczyć jakie są</div>
              </>
            ) : !pileMode ? (
              /* pile off - cards spread left to right (click = popup) */
              <>
                <button
                  type="button"
                  onClick={() => setShowPile(true)}
                  title="Pokaż karty ze stołu"
                  className="relative"
                  style={{ width: spreadW, height: spreadH }}
                >
                  {hiddenCards.map((c, i) => {
                    const col = i % spCols
                    const row = Math.floor(i / spCols)
                    const jx = ((i * 37) % 5) - 2
                    const jy = ((i * 53) % 3) - 1
                    const rot = ((i * 29) % 13) - 6
                    return (
                      <span
                        key={c.id}
                        className="absolute deal-in"
                        style={{
                          left: col * spStepX + jx,
                          top: row * spStepY + jy,
                          transform: `rotate(${rot}deg)`,
                          zIndex: i,
                          animationDelay: `${Math.min(i, 8) * 45}ms`,
                        }}
                      >
                        <PlayingCard card={c} size="lg" />
                      </span>
                    )
                  })}
                  <span className="absolute top-0.5 right-0.5 z-50 text-[0.625rem] font-bold bg-amber-400 text-slate-900 rounded-full px-1.5 py-0.5 shadow-md leading-none">
                    {hiddenCards.length}
                  </span>
                </button>
                <div className="text-[0.5625rem] text-slate-300/70">kliknij, żeby zobaczyć jakie są</div>
              </>
            ) : (
              state.tableBatches.map((batch, bi) => (
                <div
                  key={bi}
                  className={`flex gap-1 ${batch.type === 'final' ? 'rounded-lg ring-1 ring-amber-400/50 bg-amber-500/10 px-1.5 py-1' : ''}`}
                  style={{
                    // later rows paint above the earlier ones and cover them halfway
                    position: 'relative',
                    zIndex: bi,
                    marginTop: bi ? rowMargin : undefined,
                  }}
                >
                  {batch.cards.map((c, ci) => (
                    <span
                      key={c.id}
                      className="deal-in inline-block"
                      style={{
                        transform: `rotate(${((ci % 3) - 1) * 2}deg)`,
                        animationDelay: `${ci * 60}ms`,
                      }}
                    >
                      <PlayingCard card={c} size={fit.size} />
                    </span>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* your hand - on the phone it starts collapsed, tap to expand */}
          <div
            className={`pointer-events-auto flex flex-col items-center gap-0.5 pb-1 ${narrow ? 'w-full cursor-pointer' : ''}`}
            onClick={() => {
              if (narrow && !you.isEliminated) setHandOpen((o) => !o)
            }}
          >
            {/* the count label is gone - on the phone only the chevron stays
                (tap the area to unfold the hand) */}
            {narrow && !you.isEliminated && (
              <div className="flex items-center justify-center text-amber-200/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)] text-[0.625rem]">
                {handOpen ? '\u25B2' : '\u25BC'}
              </div>
            )}
            <div
              className={`flex justify-center px-2 ${
                narrow ? `overflow-hidden transition-all duration-200 ${handOpen ? 'max-h-[9.375rem] items-end' : 'max-h-8 items-start'}` : 'items-end'
              }`}
            >
              {you.isEliminated ? (
                <div className="text-slate-300 text-sm py-3">{'\u2620'} Obserwujesz grę</div>
              ) : (
                you.hand.map((c, i) => {
                  const rot = (i - mid) * 5
                  const lift = Math.abs(i - mid) * 3
                  return (
                    <span
                      key={c.id}
                      className="inline-block -ml-4 first:ml-0"
                      style={{ transform: `translateY(${lift}px) rotate(${rot}deg)`, zIndex: i }}
                    >
                      <PlayingCard
                        card={c}
                        size={handSize}
                        className="deal-in transition-transform duration-150 hover:-translate-y-2 hover:scale-105 hover:z-30 cursor-pointer shadow-xl"
                        style={{ animationDelay: `${i * 90}ms` }}
                      />
                    </span>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {showHistory && <History items={state.history} onClose={() => setShowHistory(false)} />}
      </main>

      {/* ---------- Footer: bid grid + controls (fixed height) ---------- */}
      <footer className="relative z-20 shrink-0 border-t border-amber-500/25 bg-slate-950/80 backdrop-blur px-3 py-1.5">
        {/* capped + centred so the menu stays a coherent block on ultrawide screens */}
        <div className="w-full mx-auto max-w-[90rem] flex flex-col md:flex-row gap-1.5 md:gap-3">
        {/* left column: the bid grid */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1.5">
          <div className="w-full flex justify-center pb-1">
            <BidGrid
              currentBid={state.currentBid}
              selected={selected}
              onSelect={setSelected}
              disabled={!yourTurn}
              maxCount={state.maxCount}
              compact={cf}
            />
          </div>
        </div>

        {/* right column: avatar + status, current bid, buttons - every row has a fixed height */}
        <div className={`w-full ${cf ? 'md:w-72' : 'md:w-64'} shrink-0 flex flex-col gap-1`}>
          {/* row 1: our avatar + who plays / what we are picking */}
          <div className={`${cf ? 'h-7' : 'h-9'} flex items-center justify-center gap-2`}>
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm border-2 shrink-0 transition-all ${
                yourTurn
                  ? 'border-amber-400 bg-amber-500/20 animate-pulse-glow shadow-md shadow-amber-500/30'
                  : 'border-white/25 opacity-60'
              }`}
            >
              <Avatar value={profile.avatar} className="w-full h-full text-sm" />
            </span>
            <span
              className={`text-sm font-semibold truncate ${
                yourTurn ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {yourTurn ? (
                selected ? (
                  <>
                    Podbijesz do{' '}
                    <b className="text-white">
                      {selected.count} <span className="text-amber-400">&times;</span> {selected.value}
                    </b>
                  </>
                ) : (
                  'Twój ruch!'
                )
              ) : state.phase === 'bid' ? (
                <>
                  Teraz gra: <b className="text-amber-300">{current?.name}</b>
                </>
              ) : state.phase === 'checking' ? (
                'Sprawdzanie...'
              ) : (
                'Koniec rundy'
              )}
            </span>
          </div>

          {/* row 2: who raised - always sits above the PODBIJ button */}
          <div
            key={state.currentBid ? `${state.currentBid.count}-${state.currentBid.value}-${state.round}` : 'no-bid'}
            className={`pop-in ${cf ? 'h-7' : 'h-9'} flex items-center justify-center gap-2 rounded-xl border-2 border-amber-400/60 bg-slate-950/80 px-3 shadow-lg`}
          >
            {state.currentBid ? (
              <>
                <span className={`${cf ? 'text-xl' : 'text-2xl'} font-extrabold text-white leading-none`}>
                  {state.currentBid.count} <span className="text-amber-400">&times;</span> {state.currentBid.value}
                </span>
                <span className="text-[0.6875rem] text-amber-200/80">podbił {state.currentBid.playerName}</span>
              </>
            ) : (
              <span className="text-xs text-slate-300">
                Brak deklaracji - zaczyna <b className="text-amber-300">{current?.name}</b>
              </span>
            )}
          </div>

          {/* side by side on narrow screens, stacked on wide ones */}
          <div className="flex gap-2 md:flex-col">
            <button
              type="button"
              onClick={handleBid}
              disabled={!yourTurn || !selected}
              className={`flex-1 md:flex-none w-auto md:w-full ${cf ? 'py-1.5 text-base' : 'py-2 text-lg'} rounded-xl btn-primary disabled:opacity-30 disabled:cursor-not-allowed text-white font-bold transition-colors`}
            >
              PODBIJ
            </button>
            <button
              type="button"
              onClick={handleCheck}
              disabled={!yourTurn || !state.currentBid}
              className={`flex-1 md:flex-none w-auto md:w-full ${cf ? 'py-1.5 text-base' : 'py-2 text-lg'} rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-30 disabled:cursor-not-allowed text-amber-950 font-bold transition-all hover:scale-[1.02] shadow-md shadow-amber-500/20`}
            >
              SPRAWDZAM!
            </button>
          </div>

          {/* warning line - reserved height so the footer never jumps */}
          <div className={`${cf ? 'h-3.5 leading-3.5' : 'h-4 leading-4'} text-[0.625rem] text-amber-300 text-center`}>
            {yourTurn && state.currentBid && moves.length === 0
              ? '\u26A0 Brak mocniejszych deklaracji - musisz sprawdzić'
              : ''}
          </div>
        </div>
        </div>
      </footer>

      {/* ---------- Overlays ---------- */}
      {state.checkResult && (
        <CheckOverlay
          state={state}
          back={back}
          canRestart={isHostGame}
          instantGo={online}
          endsAt={roundEndsAt}
          onNext={() => send({ type: 'NEXT_ROUND' })}
          onRestart={() => send({ type: 'RESTART' })}
        />
      )}
      {/* ---------- Popup: cards from earlier rotations ---------- */}
      {showPile && hiddenCards.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex p-4 overflow-y-auto hide-scrollbar"
          onClick={() => setShowPile(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] flex flex-col m-auto rounded-2xl border border-amber-400/40 bg-slate-900/95 shadow-2xl pop-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
              <div>
                <div className="text-[0.6875rem] uppercase tracking-widest text-amber-300/80">Karty na stole</div>
                <div className="text-lg font-bold text-white">
                  {hiddenCards.length} {kartForm(hiddenCards.length)} - wszystkie
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPile(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                title="Zamknij"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto hide-scrollbar p-4">
              <div className="flex flex-wrap gap-1.5 justify-center">
                {hiddenCards.map((c) => (
                  <PlayingCard
                    key={c.id}
                    card={c}
                    size="xl"
                    highlight={c.isJoker || c.value === state.currentBid?.value}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showOpts && <SettingsModal onClose={() => setShowOpts(false)} />}
    </div>
    </DeckContext.Provider>
  )
}
