import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Crown, LogOut, Play, Settings, X, Link2 } from 'lucide-react'
import Avatar from '../components/Avatar'
import SettingsModal from '../components/SettingsModal.jsx'
import { BOTS } from '../lib/bots.js'
import { socket, emitAck } from '../lib/socket.js'

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem('blef.lobby') || '{}')
  } catch {
    return {}
  }
}

export default function Lobby({ profile, room, onStart, onLeave }) {
  const [players, setPlayers] = useState([{ id: 'you', name: profile.nickname, avatar: profile.avatar, isYou: true }])
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const online = !!profile.online
  const youId = profile.youId
  const [table, setTable] = useState(null) // state pushed by the server (online mode)
  const startedRef = useRef(false)
  const isHost = online ? table?.hostId === youId : !!room.isOwner
  const [decks, setDecks] = useState(() => (loadSettings().decks === 2 ? 2 : 1))
  const [backKind, setBackKind] = useState(() => loadSettings().backKind || 'preset')
  const [backPreset, setBackPreset] = useState(() => loadSettings().backPreset || 'gold')
  const [backUrl, setBackUrl] = useState(() => loadSettings().backUrl || '')
  const [showSettings, setShowSettings] = useState(false) // settings popup (gear)

  // the shared settings modal owns the card-back UI and reports changes here,
  // so the host push, persistence and start() below keep working unchanged
  const handleBackChange = (b) => {
    setBackKind(b.kind)
    setBackPreset(b.preset)
    setBackUrl(b.url)
  }

  // fixed seat count: 1 deck = 5 players, 2 decks = 10 players (2 columns of 5)
  const seatCount = decks === 2 ? 10 : 5
  const seatRef = useRef(seatCount)
  useEffect(() => {
    seatRef.current = seatCount
  }, [seatCount])

  // remember the choice (no need to re-set on every visit)
  useEffect(() => {
    try {
      localStorage.setItem('blef.lobby', JSON.stringify({ decks, backKind, backPreset, backUrl }))
    } catch {
      /* e.g. dataURL too large - skip */
    }
  }, [decks, backKind, backPreset, backUrl])

  // switching decks - dropping to 1 deck keeps max 5 players (you + 4)
  const changeDecks = (d) => {
    if (online) {
      emitAck('table:settings', { decks: d }) // server answers or sends an 'err' toast
      return
    }
    setDecks(d)
    if (d === 1) {
      setPlayers((prev) => {
        if (prev.length <= 5) return prev
        const youP = prev.find((p) => p.isYou) || prev[0]
        const others = prev.filter((p) => p !== youP).slice(0, 4)
        return [youP, ...others]
      })
    }
  }

  // online mode: the server owns the lobby - we mirror its state and flip
  // to the game screen as soon as it starts the round
  useEffect(() => {
    if (!online) return
    const onTable = (t) => {
      setTable(t)
      setDecks(t.decks)
      setPlayers(t.players.map((p) => ({ ...p, isYou: p.id === youId })))
      if (t.cardBack) {
        setBackKind(t.cardBack.kind)
        if (t.cardBack.kind === 'url') setBackUrl(t.cardBack.value)
        else setBackPreset(t.cardBack.value)
      }
      if (t.status === 'game' && !startedRef.current) {
        startedRef.current = true
        onStart({ decks: t.decks, cardBack: t.cardBack, players: t.players })
      }
    }
    socket.on('table:update', onTable)
    emitAck('table:sync').then((res) => {
      if (res.ok) onTable(res.table)
      else onLeave() // room vanished (e.g. server restart) - back to the main menu
    })
    return () => socket.off('table:update', onTable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  // the host's card back travels with the table (guarded so it settles after one round-trip)
  useEffect(() => {
    if (!online || !isHost || !table) return
    const cardBack =
      backKind === 'url' && backUrl.trim() ? { kind: 'url', value: backUrl.trim() } : { kind: 'preset', value: backPreset }
    const same = table.cardBack && table.cardBack.kind === cardBack.kind && table.cardBack.value === cardBack.value
    if (same) return
    emitAck('table:settings', { cardBack })
  }, [backKind, backPreset, backUrl, table, online, isHost])

  // bots - picked at random from the pool, on demand
  const addBot = () => {
    if (online) {
      emitAck('table:addBot')
      return
    }
    setPlayers((prev) => {
      if (prev.length >= seatRef.current) return prev
      const used = new Set(prev.map((p) => p.id))
      const free = BOTS.filter((b) => !used.has(b.id))
      if (!free.length) return prev
      const bot = free[Math.floor(Math.random() * free.length)]
      return [...prev, { ...bot, isBot: true }]
    })
  }
  const removeBot = (id) => {
    if (online) {
      emitAck('table:removeBot', { id })
      return
    }
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  // Clipboard API only exists in secure contexts (https / localhost) - on a plain
  // http://<lan-ip> address it is missing or blocked, so fall back to the old
  // textarea + execCommand trick. Returns true only when something was copied.
  const copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      }
    } catch {
      // clipboard blocked -> legacy path below
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '-1000px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      ta.setSelectionRange?.(0, text.length) // iOS
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }

  const copyCode = async () => {
    if (await copyText(room.code)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const copyLink = async () => {
    if (await copyText(`${window.location.origin}/?room=${room.code}`)) {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1500)
    }
  }

  const start = () => {
    if (online) {
      emitAck('table:start') // server flips status -> table:update carries us into the game
      return
    }
    const cardBack =
      backKind === 'url' && backUrl.trim()
        ? { kind: 'url', value: backUrl.trim() }
        : { kind: 'preset', value: backPreset }
    onStart({ decks, cardBack, players })
  }

  const half = seatCount > 5 // 10 seats = 2 columns of 5, rows half as tall
  const seatList = Array.from({ length: seatCount }, (_, i) => players[i] || null)

  return (
    <div className="h-[100dvh] felt overflow-hidden flex p-3 sm:p-4">
      <div className="w-full max-w-md m-auto rounded-2xl border border-amber-500/30 bg-slate-900/85 backdrop-blur shadow-2xl p-4 sm:p-5 overflow-hidden">
        {/* table code - one compact row */}
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-2.5">
            <span className="text-[0.625rem] uppercase tracking-[0.3em] text-slate-400">Poczekalnia</span>
            <button
              type="button"
              onClick={copyCode}
              className="px-3.5 py-1 rounded-lg bg-slate-800 border-2 border-dashed border-amber-400/60 hover:border-amber-300 transition-colors group"
              title="Kliknij, aby skopiować kod"
            >
              <span className="text-xl font-extrabold tracking-[0.3em] text-amber-300">{room.code}</span>
              <span className="ml-1.5 text-slate-400 group-hover:text-amber-300 inline-block align-middle">
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </span>
            </button>
            <button
              type="button"
              onClick={copyLink}
              title="Kopiuj link do stołu"
              className="px-2.5 py-2 rounded-lg bg-slate-800 border border-white/15 hover:border-amber-300 transition-colors"
            >
              {copiedLink ? <Check size={15} className="text-emerald-300" /> : <Link2 size={15} className="text-slate-400" />}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              title="Ustawienia"
              aria-label="Ustawienia"
              className="px-2.5 py-2 rounded-lg bg-slate-800 border border-white/15 hover:border-amber-300 transition-colors"
            >
              <Settings size={15} className="text-slate-400" />
            </button>
          </div>
          <div className="text-[0.6875rem] text-slate-400 mt-1">
            Podaj znajomym ten kod, żeby dołączyli
            {room.password && <span className="text-sky-300"> &middot; hasło: <span className="font-semibold">{room.password}</span></span>}
          </div>
        </div>

        {/* decks - set by the host */}
        {(!online || isHost) && (
        <div className="mb-3">
          <div className="text-[0.625rem] uppercase tracking-widest text-amber-200/80 mb-1.5">Talie</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => changeDecks(1)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                decks === 1 ? 'btn-primary border-transparent text-white' : 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700'
              }`}
            >
              1 talia (54) - 5 miejsc, do 6&times;
            </button>
            <button
              type="button"
              onClick={() => changeDecks(2)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                decks === 2 ? 'btn-primary border-transparent text-white' : 'bg-slate-800 border-white/10 text-slate-400 hover:bg-slate-700'
              }`}
            >
              2 talie (108) - 10 miejsc, do 12&times;
            </button>
          </div>
        </div>
        )}

        {/* fixed seat grid - always the same number of rows, the page never scrolls */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[0.625rem] uppercase tracking-widest text-amber-200/80">
              Miejsca <span className="text-slate-400 normal-case tracking-normal">({players.length}/{seatCount})</span>
            </span>
            <button
              type="button"
              onClick={addBot}
              disabled={players.length >= seatCount || (online && !isHost)}
              title={online && !isHost ? 'Boty dodaje gospodarz' : undefined}
              className="px-2 py-1 rounded-lg text-[0.6875rem] font-semibold bg-slate-800 border border-white/10 text-slate-300 hover:border-amber-300 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Dodaj bota
            </button>
          </div>
          <div className={`grid gap-1.5 ${half ? 'grid-cols-2 grid-rows-5 grid-flow-col' : 'grid-cols-1'}`}>
            {seatList.map((p, i) =>
              p ? (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 rounded-lg bg-slate-800/70 border px-2 pop-in min-w-0 ${
                    half ? 'py-1' : 'py-1.5'
                  } ${p.isYou ? 'border-amber-400/50' : 'border-white/10'}`}
                >
                  <Avatar value={p.avatar} className={`${half ? 'w-5 h-5 text-sm' : 'w-7 h-7 text-lg'} shrink-0`} />
                  <span
                    className={`font-semibold truncate min-w-0 ${half ? 'text-[0.6875rem]' : 'text-sm'} ${
                      p.isYou ? 'text-amber-300' : 'text-slate-100'
                    }`}
                  >
                    {p.name}
                  </span>
                  {p.isYou && isHost && <Crown size={half ? 12 : 14} className="text-amber-400 shrink-0" />}
                  {p.isBot && isHost && (
                    <button
                      type="button"
                      onClick={() => removeBot(p.id)}
                      title="Usuń bota"
                      className="ml-auto shrink-0 text-slate-500 hover:text-red-300 transition-colors"
                    >
                      <X size={half ? 12 : 14} />
                    </button>
                  )}
                </div>
              ) : (
                // identical box to an occupied seat (same padding, avatar slot, font)
                <div
                  key={i}
                  className={`flex items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-2 ${
                    half ? 'py-1' : 'py-1.5'
                  }`}
                >
                  <span
                    className={`rounded-full border border-dashed border-white/20 flex items-center justify-center text-slate-600 shrink-0 ${
                      half ? 'w-5 h-5 text-xs' : 'w-7 h-7 text-lg'
                    }`}
                  >
                    {'\u{1F0B0}'}
                  </span>
                  <span className={`${half ? 'text-[0.6875rem]' : 'text-sm'} text-slate-500`}>wolne miejsce</span>
                </div>
              )
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onLeave}
            className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
          >
            <LogOut size={18} />
          </button>
          <button
            type="button"
            onClick={start}
            disabled={players.length < 2 || (online && !isHost)}
            title={online && !isHost ? 'Grę rozpoczyna gospodarz' : undefined}
            className="flex-1 py-3 rounded-xl btn-primary disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-lg transition-colors flex items-center justify-center gap-2"
          >
            <Play size={20} /> Rozpocznij grę
          </button>
        </div>
        {online && (
          <div className="text-center text-[0.625rem] text-slate-500 mt-2">
            Znajomi wchodzą kodem albo linkiem - wyślij im kod z góry
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onBackChange={handleBackChange}
          backLocked={online && !isHost}
        />
      )}
    </div>
  )
}
