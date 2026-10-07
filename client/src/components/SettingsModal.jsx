import { useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import PlayingCard from './PlayingCard.jsx'
import OptionsSection from './OptionsSection.jsx'
import { FACE_STYLES, getFaceId, setFaceStyle } from '../lib/faces.js'
import { ICON_SETS, getFrontSetId, setFrontSet } from '../lib/icons.js'
import { THEMES, resolveTheme, getStoredTheme, saveTheme, applyTheme } from '../lib/themes.js'
import { fileToDataUrl } from '../lib/image.js'

const BACK_PRESETS = ['gold', 'crimson', 'teal', 'casino', 'vegas', 'lucky', 'noir', 'royal', 'ice']

function loadLobby() {
  try {
    return JSON.parse(localStorage.getItem('blef.lobby') || '{}')
  } catch {
    return {}
  }
}

// Section header that collapses/expands its block (click = toggle)
function SectionHeader({ label, hint, open, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? 'Zwiń sekcję' : 'Rozwiń sekcję'}
      className="w-full flex items-center gap-1.5 text-[0.625rem] uppercase tracking-widest text-amber-200/80 mb-1.5 text-left group"
    >
      <span className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-90' : ''} text-slate-400 group-hover:text-amber-300`}>&#8250;</span>
      <span className="flex items-center gap-1.5">
        {label}
        {hint && <span className="normal-case tracking-normal text-slate-500">{hint}</span>}
      </span>
      <span className="ml-auto text-[0.5625rem] normal-case tracking-normal text-slate-500 group-hover:text-slate-300">
        {open ? 'zwiń' : 'rozwiń'}
      </span>
    </button>
  )
}

// The one settings popup shared by the main menu and the lobby:
// tab "Karty i stół" (backs, fronts, table, icons) + tab "Dostępność" (accessibility).
// Everything is personal and persisted to localStorage.
export default function SettingsModal({ onClose, onBackChange, backLocked = false }) {
  const saved = loadLobby()
  const [backKind, setBackKind] = useState(() => saved.backKind || 'preset')
  const [backPreset, setBackPreset] = useState(() => saved.backPreset || 'gold')
  const [backUrl, setBackUrl] = useState(() => saved.backUrl || '')
  const [backErr, setBackErr] = useState('')
  const [face, setFace] = useState(getFaceId)
  const [frontSet, setFrontSetState] = useState(() => getFrontSetId(getFaceId()))
  const [theme, setTheme] = useState(() => getStoredTheme())
  const [open, setOpen] = useState({ back: false, style: false, theme: false, icons: false })
  const [tab, setTab] = useState('general') // general | a11y
  const backFileRef = useRef(null)

  const toggleSection = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // persist the card back (keep the decks key owned by the lobby) + notify the lobby
  const commitBack = (kind, preset, url) => {
    setBackKind(kind)
    setBackPreset(preset)
    setBackUrl(url)
    try {
      localStorage.setItem('blef.lobby', JSON.stringify({ ...loadLobby(), backKind: kind, backPreset: preset, backUrl: url }))
    } catch {
      /* np. za duży dataURL - pomijamy */
    }
    onBackChange?.({ kind, preset, url })
  }

  const pickBackFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const url = await fileToDataUrl(file, { maxSize: 480 })
      commitBack('url', backPreset, url)
      setBackErr('')
    } catch (err) {
      setBackErr(err.message || 'Nie udało się wczytać obrazka')
    }
  }

  const pickFace = (id) => {
    setFace(id)
    setFaceStyle(id)
    setFrontSetState(getFrontSetId(id))
  }

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex p-3" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto my-auto max-h-[86vh] overflow-y-auto hide-scrollbar rounded-2xl border border-amber-400/40 bg-slate-900/95 shadow-2xl p-4 pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-extrabold gold-text flex items-center gap-2">
            <Settings size={17} className="text-amber-300" /> Ustawienia
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
            aria-label="Zamknij"
          >
            {'\u2715'}
          </button>
        </div>

        {/* tabs: everything in one place, accessibility as its own tab */}
        <div className="flex gap-1 p-1 rounded-xl bg-slate-800/70 border border-white/10 mb-3">
          {[['general', 'Karty i stół'], ['a11y', 'Dostępność']].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-1.5 rounded-lg text-[0.6875rem] font-bold uppercase tracking-wider transition-colors ${
                tab === id ? 'bg-amber-400 text-slate-900 shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'general' ? (
          <div className="space-y-3">
            <div>
              <SectionHeader
                label="Rewers kart"
                hint={backLocked ? '- ustawia gospodarz' : undefined}
                open={open.back}
                onToggle={() => toggleSection('back')}
              />
              {open.back && (backLocked ? (
                <div className="text-[0.6875rem] text-slate-500">Gospodarz wybiera rewers dla całego stołu.</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    {BACK_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => commitBack('preset', p, backUrl)}
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
                      onClick={() => commitBack('url', backPreset, backUrl)}
                      className={`rounded-lg px-2 py-2 text-[0.625rem] font-semibold border transition-colors ${
                        backKind === 'url' ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-white/10 text-slate-400 hover:border-white/30'
                      }`}
                    >
                      Własny
                    </button>
                    <button
                      type="button"
                      onClick={() => backFileRef.current && backFileRef.current.click()}
                      title="Wgraj własny rewers (JPG/PNG) - obrazek zostanie zmniejszony automatycznie"
                      className={`rounded-lg px-2 py-2 text-[0.625rem] font-semibold border transition-colors ${
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
                        <span className="text-[0.6875rem] text-slate-400">Wgrany obrazek (JPG/PNG)</span>
                        <button
                          type="button"
                          onClick={() => commitBack(backKind, backPreset, '')}
                          className="ml-auto text-[0.6875rem] text-red-300 hover:text-red-200 underline"
                        >
                          Usuń
                        </button>
                      </div>
                    ) : (
                      <input
                        value={backUrl}
                        onChange={(e) => commitBack(backKind, backPreset, e.target.value.slice(0, 400))}
                        placeholder="link do obrazka (jpg/png), np. z imgur"
                        className="mt-1.5 w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                      />
                    ))}
                  {backErr && <div className="text-[0.6875rem] text-red-400 mt-1">{backErr}</div>}
                </>
              ))}
            </div>

            <div>
              <SectionHeader label="Styl przodu" open={open.style} onToggle={() => toggleSection('style')} />
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
                      <div className={`text-[0.5rem] text-center mt-0.5 ${face === id ? 'text-amber-300' : 'text-slate-500'}`}>
                        {FACE_STYLES[id].label}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionHeader label="Stół i przyciski" open={open.theme} onToggle={() => toggleSection('theme')} />
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
                        <span className={`block text-[0.5rem] text-center mt-0.5 ${theme.id === id ? 'text-amber-300' : 'text-slate-500'}`}>
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
                      <span className={`block text-[0.5rem] text-center mt-0.5 ${theme.id === 'custom' ? 'text-amber-300' : 'text-slate-500'}`}>
                        Własny
                      </span>
                    </button>
                  </div>
                  {theme.id === 'custom' && (
                    <div className="flex gap-4 items-center text-[0.6875rem] text-slate-300">
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
                      <span className="flex items-center gap-1 text-[0.8125rem] leading-none">
                        {ICON_SETS[id].suits.map((g) => (
                          <span key={g}>{g}</span>
                        ))}
                        <span className="opacity-60 ml-0.5">{ICON_SETS[id].joker}</span>
                      </span>
                      <span className={`block text-[0.5rem] mt-0.5 ${frontSet === id ? 'text-amber-300' : 'text-slate-500'}`}>
                        {ICON_SETS[id].label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <OptionsSection />
        )}
      </div>
    </div>
  )
}
