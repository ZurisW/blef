import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Crown, LogOut, Play, ChevronDown, Settings, X, Link2 } from 'lucide-react'
import PlayingCard from '../components/PlayingCard'
import Avatar from '../components/Avatar'
import { FACE_STYLES, getFaceId, setFaceStyle } from '../lib/faces.js'
import { ICON_SETS, getFrontSetId, setFrontSet } from '../lib/icons.js'
import { THEMES, resolveTheme, getStoredTheme, saveTheme, applyTheme } from '../lib/themes.js'
import { BOTS } from '../lib/bots.js'
import { socket, emitAck } from '../lib/socket.js'
import { fileToDataUrl } from '../lib/image.js'

const BACK_PRESETS = ['gold', 'crimson', 'teal', 'casino', 'vegas', 'lucky', 'noir', 'royal', 'ice']

// Section header that collapses/expands its block (click = toggle)
function SectionHeader({ label, hint, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Zwiń sekcję' : 'Rozwiń sekcję'}
      className="w-full flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-amber-200/80 mb-1.5 text-left group"
    >
      <ChevronDown
        size={13}
        className={`shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'} text-slate-400 group-hover:text-amber-300`}
      />
      <span className="flex items-center gap-1.5">
        {label}
        {hint && <span className="normal-case tracking-normal text-slate-500">{hint}</span>}
      </span>
      <span className="ml-auto text-[9px] normal-case tracking-normal text-slate-500 group-hover:text-slate-300">
        {open ? 'zwiń' : 'rozwiń'}
      </span>
    </button>
  )
}

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
  const [backErr, setBackErr] = useState('')
  const [face, setFace] = useState(getFaceId)
  const [frontSet, setFrontSetState] = useState(() => getFrontSetId(getFaceId()))
  // collapsible settings sections - all start collapsed
  const [open, setOpen] = useState({ back: false, style: false, theme: false, icons: false })
  const toggleSection = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  // table theme (personal, like the card face style)
  const [theme, setTheme] = useState(() => getStoredTheme())
  const pickTheme = (id) => {
    const t = { id, felt: theme.felt || '#1e7a5b', accent: theme.accent || '#f59e0b' }
    setTheme(t)
    saveTheme(t)
    applyTheme(t)
  }
  const setCustomColor = (key, value) => {
    const t = { ...theme, id: 'custom', [key]: value }
    setTheme(t)
    saveTheme(t)
    applyTheme(t)
  }
  const [showSettings, setShowSettings] = useState(false) // settings popup (gear)
  const backFileRef = useRef(null)

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

  const pickFace = (id) => {
    setFace(id)
    setFaceStyle(id)
    setFrontSetState(getFrontSetId(id))
  }

  const pickBackFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const url = await fileToDataUrl(file, { maxSize: 480 })
      setBackUrl(url)
      setBackKind('url')
      setBackErr('')
    } catch (err) {
      setBackErr(err.message || 'Nie udało się wczytać obrazka')
    }
  }

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
            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Poczekalnia</span>
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
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Podaj znajomym ten kod, żeby dołączyli
            {room.password && <span className="text-sky-300"> &middot; hasło: <span className="font-semibold">{room.password}</span></span>}
          </div>
        </div>

        {/* decks - set by the host */}
        {(!online || isHost) && (
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest text-amber-200/80 mb-1.5">Talie</div>
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
            <span className="text-[10px] uppercase tracking-widest text-amber-200/80">
              Miejsca <span className="text-slate-400 normal-case tracking-normal">({players.length}/{seatCount})</span>
            </span>
            <button
              type="button"
              onClick={addBot}
              disabled={players.length >= seatCount || (online && !isHost)}
              title={online && !isHost ? 'Boty dodaje gospodarz' : undefined}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-800 border border-white/10 text-slate-300 hover:border-amber-300 hover:text-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                    className={`font-semibold truncate min-w-0 ${half ? 'text-[11px]' : 'text-sm'} ${
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
                  <span className={`${half ? 'text-[11px]' : 'text-sm'} text-slate-500`}>wolne miejsce</span>
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
          <div className="text-center text-[10px] text-slate-500 mt-2">
            Znajomi wchodzą kodem albo linkiem - wyślij im kod z góry
          </div>
        )}
      </div>

      {/* gear - table settings open in a popup */}
      <button
        type="button"
        onClick={() => setShowSettings(true)}
        title="Ustawienia stołu - rewers, styl, ikony"
        className="fixed right-4 bottom-4 z-30 w-12 h-12 rounded-full bg-slate-800 border border-amber-400/40 hover:border-amber-300 text-amber-300 shadow-xl flex items-center justify-center transition-colors"
      >
        <Settings size={22} />
      </button>

      {showSettings && (
        <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex p-3" onClick={() => setShowSettings(false)}>
          <div
            className="w-full max-w-lg mx-auto my-auto max-h-[86vh] overflow-y-auto hide-scrollbar rounded-2xl border border-amber-400/40 bg-slate-900/95 shadow-2xl p-4 pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold gold-text flex items-center gap-2">
                <Settings size={17} className="text-amber-300" /> Ustawienia stołu
              </h2>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                aria-label="Zamknij"
              >
                {'\u2715'}
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <SectionHeader
                  label="Rewers kart"
                  hint={online && !isHost ? '- ustawia gospodarz' : undefined}
                  open={open.back}
                  onToggle={() => toggleSection('back')}
                />
                {open.back && (online && !isHost ? (
                  <div className="text-[11px] text-slate-500">Gospodarz wybiera rewers dla całego stołu.</div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      {BACK_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setBackKind('preset')
                            setBackPreset(p)
                          }}
                          className={`rounded-lg p-1 border transition-all ${
                            backKind === 'preset' && backPreset === p ? 'border-amber-400 scale-105' : 'border-white/10 hover:border-white/30'
                          }`}
                          title={`Wzór ${p}`}
                        >
                          <PlayingCard faceDown size="sm" back={{ kind: 'preset', value: p }} />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setBackKind('url')}
                        className={`rounded-lg px-2 py-2 text-[10px] font-semibold border transition-colors ${
                          backKind === 'url' ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:border-white/30'
                        }`}
                      >
                        Własny
                      </button>
                      <button
                        type="button"
                        onClick={() => backFileRef.current && backFileRef.current.click()}
                        title="Wgraj własny rewers (JPG/PNG) - obrazek zostanie zmniejszony automatycznie"
                        className={`rounded-lg px-2 py-2 text-[10px] font-semibold border transition-colors ${
                          backKind === 'url' && backUrl.startsWith('data:') ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:border-white/30'
                        }`}
                      >
                        {'\u{1F4C1}'} Plik
                      </button>
                      <input
                        ref={backFileRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={pickBackFile}
                      />
                    </div>
                    {backKind === 'url' &&
                      (backUrl.startsWith('data:') ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div
                            className="w-8 h-11 rounded border border-white/15 overflow-hidden shrink-0"
                            style={{ backgroundImage: `url("${backUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
                          />
                          <span className="text-[11px] text-slate-400">Wgrany obrazek (JPG/PNG)</span>
                          <button
                            type="button"
                            onClick={() => setBackUrl('')}
                            className="ml-auto text-[11px] text-red-300 hover:text-red-200 underline"
                          >
                            Usuń
                          </button>
                        </div>
                      ) : (
                        <input
                          value={backUrl}
                          onChange={(e) => setBackUrl(e.target.value.slice(0, 400))}
                          placeholder="link do obrazka (jpg/png), np. z imgur"
                          className="mt-1.5 w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                        />
                      ))}
                    {backErr && <div className="text-[11px] text-red-400 mt-1">{backErr}</div>}
                  </>
                ))}
              </div>

              <div>
                <SectionHeader label="Styl przodu" hint="- tylko u Ciebie" open={open.style} onToggle={() => toggleSection('style')} />
                {open.style && (
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(FACE_STYLES).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => pickFace(id)}
                        title={FACE_STYLES[id].label}
                        className={`rounded-lg p-1 border transition-all ${
                          face === id ? 'border-amber-400 scale-105' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <PlayingCard card={{ value: 'Q', suit: '\u2665' }} size="sm" face={id} />
                        <div className={`text-[8px] text-center mt-0.5 ${face === id ? 'text-amber-300' : 'text-slate-500'}`}>
                          {FACE_STYLES[id].label}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <SectionHeader label="Stół i przyciski" hint="- tylko u Ciebie" open={open.theme} onToggle={() => toggleSection('theme')} />
                {open.theme && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      {Object.keys(THEMES).map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => pickTheme(id)}
                          title={THEMES[id].label}
                          className={`rounded-lg p-1 border transition-all ${
                            theme.id === id ? 'border-amber-400 scale-105' : 'border-white/10 hover:border-white/30'
                          }`}
                        >
                          <span className="block h-8 rounded" style={{ background: THEMES[id].felt }} />
                          <span className="flex justify-center gap-1 mt-1">
                            <i className="w-3 h-3 rounded-sm" style={{ background: THEMES[id].primary }} />
                            <i className="w-3 h-3 rounded-sm" style={{ background: THEMES[id].gold }} />
                          </span>
                          <span className={`block text-[8px] text-center mt-0.5 ${theme.id === id ? 'text-amber-300' : 'text-slate-500'}`}>
                            {THEMES[id].label}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => pickTheme('custom')}
                        title="Własne kolory"
                        className={`rounded-lg p-1 border transition-all ${
                          theme.id === 'custom' ? 'border-amber-400 scale-105' : 'border-white/10 hover:border-white/30'
                        }`}
                      >
                        <span className="block h-8 rounded" style={{ background: resolveTheme({ id: 'custom', felt: theme.felt, accent: theme.accent }).felt }} />
                        <span className="flex justify-center gap-1 mt-1">
                          <i className="w-3 h-3 rounded-sm" style={{ background: theme.felt || '#1e7a5b' }} />
                          <i className="w-3 h-3 rounded-sm" style={{ background: theme.accent || '#f59e0b' }} />
                        </span>
                        <span className={`block text-[8px] text-center mt-0.5 ${theme.id === 'custom' ? 'text-amber-300' : 'text-slate-500'}`}>
                          Własny
                        </span>
                      </button>
                    </div>
                    {theme.id === 'custom' && (
                      <div className="flex gap-4 items-center text-[11px] text-slate-300">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span>Stół</span>
                          <input
                            type="color"
                            value={theme.felt || '#1e7a5b'}
                            onChange={(e) => setCustomColor('felt', e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/20 p-0"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <span>Akcent</span>
                          <input
                            type="color"
                            value={theme.accent || '#f59e0b'}
                            onChange={(e) => setCustomColor('accent', e.target.value)}
                            className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/20 p-0"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <SectionHeader
                  label={
                    <>
                      Ikony przodu · <span className="text-amber-200">{FACE_STYLES[face].label}</span>
                    </>
                  }
                  open={open.icons}
                  onToggle={() => toggleSection('icons')}
                />
                {open.icons && (
                  <div className="flex gap-2 flex-wrap">
                    {Object.keys(ICON_SETS).map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setFrontSet(face, id)
                          setFrontSetState(id)
                        }}
                        className={`px-2 py-1 rounded-lg border transition-all ${
                          frontSet === id ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 hover:border-white/30 bg-slate-800'
                        }`}
                      >
                        <span className="flex items-center gap-1 text-[13px] leading-none">
                          {ICON_SETS[id].suits.map((g) => (
                            <span key={g}>{g}</span>
                          ))}
                          <span className="opacity-60 ml-0.5">{ICON_SETS[id].joker}</span>
                        </span>
                        <span className={`block text-[8px] mt-0.5 ${frontSet === id ? 'text-amber-300' : 'text-slate-500'}`}>
                          {ICON_SETS[id].label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
