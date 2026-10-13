import { useEffect, useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import PlayingCard from './PlayingCard.jsx'
import OptionsSection from './OptionsSection.jsx'
import ScaleSection from './ScaleSection.jsx'
import { FACE_STYLES, getFaceId, setFaceStyle } from '../lib/faces.js'
import { ICON_SETS, getFrontSetId, setFrontSet } from '../lib/icons.js'
import { THEMES, resolveTheme, getStoredTheme, saveTheme, applyTheme } from '../lib/themes.js'
import { fileToDataUrl } from '../lib/image.js'
import {
  readDeckFromFolder,
  readDeckFromZip,
  listDeckNames,
  saveDeck,
  removeDeck,
  missingLabel,
} from '../lib/decks.js'

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
export default function SettingsModal({ onClose, onBackChange, backLocked = false, onDeckChange = null, deckLocked = false }) {
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
  // ---- własna talia (upload folderu / ZIP-a) ----
  const [deckName, setDeckName] = useState(() => saved.deckName || '')
  const [deckList, setDeckList] = useState([])
  const [deckMsg, setDeckMsg] = useState('')
  const [deckErr, setDeckErr] = useState('')
  const [pending, setPending] = useState(null) // {name, res: {deck, missing}} - czeka na zatwierdzenie
  const folderInputRef = useRef(null)
  const zipInputRef = useRef(null)

  useEffect(() => {
    listDeckNames().then(setDeckList)
  }, [])

  const toggleSection = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }))

  // persist the card back (keep the decks key owned by the lobby) + notify open screens
  const commitBack = (kind, preset, url) => {
    setBackKind(kind)
    setBackPreset(preset)
    setBackUrl(url)
    const b = { kind, preset, url }
    try {
      localStorage.setItem('blef.lobby', JSON.stringify({ ...loadLobby(), backKind: kind, backPreset: preset, backUrl: url }))
    } catch {
      /* np. za duży dataURL - pomijamy */
    }
    onBackChange?.(b)
    try {
      window.dispatchEvent(new CustomEvent('blef:back', { detail: b }))
    } catch {
      /* non-browser env */
    }
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

  // ---- własna talia (upload folderu / ZIP-a z obrazkami kart) ----
  const commitDeck = (name) => {
    setDeckName(name)
    try {
      localStorage.setItem('blef.lobby', JSON.stringify({ ...loadLobby(), deckName: name }))
    } catch {
      /* np. tryb prywatny - pomijamy */
    }
    onDeckChange?.(name)
    try {
      window.dispatchEvent(new CustomEvent('blef:deck', { detail: name }))
    } catch {
      /* non-browser env */
    }
  }

  const stageFiles = async (read, fileOrList, nameGuess) => {
    setDeckErr('')
    setDeckMsg('')
    try {
      const res = await read(fileOrList, nameGuess)
      setPending({ name: nameGuess, res })
    } catch (err) {
      setPending(null)
      setDeckErr(err.message || 'Nie udało się wczytać plików')
    }
  }

  const onFolderPick = (e) => {
    const files = e.target.files
    e.target.value = ''
    if (!files || !files.length) return
    const guess = String((files[0] && files[0].webkitRelativePath) || files[0].name || 'Talia').split('/')[0] || 'Talia'
    stageFiles(readDeckFromFolder, files, guess)
  }

  const onZipPick = (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    stageFiles(readDeckFromZip, file, file.name.replace(/\.zip$/i, '').slice(0, 40) || 'Talia')
  }

  const savePending = async () => {
    if (!pending) return
    const name = String(pending.name || pending.res.deck.name || 'Talia').slice(0, 40)
    try {
      await saveDeck({ ...pending.res.deck, name })
    } catch (err) {
      setDeckErr('Nie udało się zapisać talii: ' + (err.message || err))
      return
    }
    setDeckList(await listDeckNames())
    const miss = pending.res.missing
    setDeckMsg(
      `Wgrałem ${Object.keys(pending.res.deck.faces).length} kart` +
        (miss.length ? ` - brakuje: ${missingLabel(miss)} (te użyją standardowego stylu)` : '') +
        '.'
    )
    setPending(null)
    commitDeck(name)
  }

  const deleteDeck = async () => {
    if (!deckName) return
    const gone = deckName
    try {
      await removeDeck(gone)
      setDeckList(await listDeckNames())
      setDeckMsg(`Usunięto talię "${gone}".`)
      commitDeck('')
    } catch (err) {
      setDeckErr('Nie udało się usunąć talii: ' + (err.message || err))
    }
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
                <>
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
                  {/* ---- własna talia: cały folder albo ZIP z obrazkami kart ---- */}
                  <div className="mt-2 pt-2 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.625rem] uppercase tracking-widest text-slate-500">Talia obrazków</span>
                      {deckLocked ? (
                        <span className="text-[0.6875rem] text-slate-500">gospodarz wybiera talię dla całego stołu</span>
                      ) : (
                        <>
                          <select
                            value={deckName}
                            onChange={(e) => commitDeck(e.target.value)}
                            className="rounded-lg bg-slate-800 border border-white/10 px-2 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                          >
                            <option value="">Standardowa</option>
                            {deckList.map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => folderInputRef.current && folderInputRef.current.click()}
                            title="Wgraj cały folder z obrazkami kart (nazwy typu QS.svg, 10H.png)"
                            className="rounded-lg px-2 py-1.5 text-[0.625rem] font-semibold border border-white/10 text-slate-300 hover:border-white/30"
                          >
                            {'\u{1F4C1}'} Folder
                          </button>
                          <button
                            type="button"
                            onClick={() => zipInputRef.current && zipInputRef.current.click()}
                            title="Wgraj plik ZIP z obrazkami kart"
                            className="rounded-lg px-2 py-1.5 text-[0.625rem] font-semibold border border-white/10 text-slate-300 hover:border-white/30"
                          >
                            {'\u{1F4E6}'} ZIP
                          </button>
                          {deckName && (
                            <button type="button" onClick={deleteDeck} className="text-[0.6875rem] text-red-300 hover:text-red-200 underline">
                              Usuń talię
                            </button>
                          )}
                          <input ref={folderInputRef} type="file" multiple className="hidden" onChange={onFolderPick} {...{ webkitdirectory: '', directory: '' }} />
                          <input
                            ref={zipInputRef}
                            type="file"
                            accept=".zip,application/zip,application/x-zip-compressed"
                            className="hidden"
                            onChange={onZipPick}
                          />
                        </>
                      )}
                    </div>
                    <div className="text-[0.5625rem] text-slate-500">
                      Nazwy plików to karty: QS.svg, 10H.png, AS.svg, joker.svg - brakujące karty użyją standardowego stylu.
                    </div>
                    {pending && (
                      <div className="flex items-center gap-2">
                        <input
                          value={pending.name}
                          onChange={(e) => setPending({ ...pending, name: e.target.value })}
                          placeholder="nazwa talii"
                          className="flex-1 min-w-0 rounded-lg bg-slate-800 border border-white/10 px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
                        />
                        <button
                          type="button"
                          onClick={savePending}
                          className="rounded-lg px-2.5 py-1.5 text-[0.625rem] font-bold bg-amber-500 text-slate-900 hover:bg-amber-400"
                        >
                          Dodaj
                        </button>
                        <button
                          type="button"
                          onClick={() => setPending(null)}
                          className="rounded-lg px-2 py-1.5 text-[0.625rem] border border-white/10 text-slate-400 hover:border-white/30"
                        >
                          Anuluj
                        </button>
                      </div>
                    )}
                    {deckMsg && <div className="text-[0.625rem] text-emerald-300/90">{deckMsg}</div>}
                    {deckErr && <div className="text-[0.625rem] text-red-400">{deckErr}</div>}
                  </div>
                </>
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
          <>
            <OptionsSection />
            <ScaleSection />
          </>
        )}
      </div>
    </div>
  )
}
