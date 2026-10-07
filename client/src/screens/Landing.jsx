import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Settings } from 'lucide-react'
import Avatar from '../components/Avatar.jsx'
import HelpModal from '../components/HelpModal.jsx'
import SettingsModal from '../components/SettingsModal.jsx'
import { fileToDataUrl } from '../lib/image.js'
import { emitAck, isConnected } from '../lib/socket.js'

export const AVATARS = [
  '\u{1F98A}', '\u{1F43B}', '\u{1F438}', '\u{1F412}', '\u{1F981}', '\u{1F42F}',
  '\u{1F43C}', '\u{1F47D}', '\u{1F916}', '\u{1F47B}', '\u{1F989}', '\u{1F427}',
  '\u{1F984}', '\u{1F409}', '\u{1F9B9}', '\u{1F9D9}',
]

// remember the last nickname (the avatar is already stored by chooseAvatar)
function loadNickname() {
  try {
    return localStorage.getItem('blef.nickname') || ''
  } catch {
    return ''
  }
}

function saveNickname(name) {
  try {
    localStorage.setItem('blef.nickname', name)
  } catch {
    /* ignoruj */
  }
}

function loadAvatar() {
  try {
    const a = localStorage.getItem('blef.avatar')
    if (a) return a
  } catch {
    /* bez localStorage */
  }
  return AVATARS[0]
}

function loadUploaded() {
  try {
    return localStorage.getItem('blef.avatar.img') || ''
  } catch {
    return ''
  }
}

export default function Landing({ onEnter }) {
  const [nickname, setNickname] = useState(loadNickname)
  const [avatar, setAvatar] = useState(loadAvatar)
  const [uploaded, setUploaded] = useState(loadUploaded)
  const [avatarErr, setAvatarErr] = useState('')
  const avatarFileRef = useRef(null)
  const [mode, setMode] = useState('create') // create | join
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [showOpts, setShowOpts] = useState(false)

  // shared link: /?room=CODE opens the form ready to join that table
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('room')
    if (c) {
      setCode(c.toUpperCase())
      setMode('join')
    }
  }, [])

  const chooseAvatar = (a) => {
    setAvatar(a)
    try {
      localStorage.setItem('blef.avatar', a)
    } catch {
      /* ignoruj */
    }
  }

  const pickAvatarFile = async (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const url = await fileToDataUrl(file, { maxSize: 256, square: true })
      setUploaded(url)
      setAvatar(url)
      try {
        localStorage.setItem('blef.avatar.img', url)
        localStorage.setItem('blef.avatar', url)
      } catch {
        /* za duże - zostaje tylko w tej sesji */
      }
      setAvatarErr('')
    } catch (err) {
      setAvatarErr(err.message || 'Nie udało się wczytać obrazka')
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!nickname.trim()) {
      setError('Wpisz swój nick!')
      return
    }
    if (mode === 'join' && code.trim().length < 3) {
      setError('Wpisz kod stołu (np. A2KD)')
      return
    }
    setError('')
    // 14 chars max - the seat layout shows the whole name without truncating
    const name = nickname.trim().slice(0, 14)
    saveNickname(name)

    if (isConnected()) {
      const res =
        mode === 'create'
          ? await emitAck('table:create', { name, avatar, password })
          : await emitAck('table:join', { code: code.trim().toUpperCase(), name, avatar, password })
      if (!res.ok) {
        setError(res.err || 'Nie udało się połączyć ze stołem')
        return
      }
      onEnter({ nickname: name, avatar, online: true, youId: res.youId, room: { ...res.room, password } })
      return
    }

    // multiplayer only - no connection, no table
    setError('Brak połączenia z serwerem - odśwież stronę i spróbuj ponownie')
  }

  return (
    <div className="h-[100dvh] felt overflow-hidden flex p-3 sm:p-4">
      <div className="w-full max-w-md m-auto rounded-2xl border border-amber-500/30 bg-slate-900/85 backdrop-blur shadow-2xl p-4 sm:p-5 relative overflow-hidden">
        {/* settings (personal options) + help - how to play (fits on screen, no scrolling) */}
        <button
          type="button"
          onClick={() => setShowOpts(true)}
          title="Ustawienia"
          className="absolute right-[3.5rem] top-3 z-10 w-9 h-9 rounded-full bg-slate-800 border border-white/10 hover:border-amber-300 text-amber-300 flex items-center justify-center transition-colors"
        >
          <Settings size={18} />
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          title="Jak się gra?"
          className="absolute right-3 top-3 z-10 w-9 h-9 rounded-full bg-slate-800 border border-white/10 hover:border-amber-300 text-amber-300 flex items-center justify-center transition-colors"
        >
          <CircleHelp size={18} />
        </button>

        {/* logo */}
        <div className="text-center mb-3">
          <div className="text-4xl font-extrabold gold-text tracking-tight drop-shadow-lg">BLEF</div>
          <div className="text-[0.6875rem] uppercase tracking-[0.35em] text-slate-400 mt-0.5">karciana gra towarzyska</div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {/* nick */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-amber-200/80 mb-1.5">Twój nick</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 14))}
              placeholder="rura0"
              className="w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            />
          </div>

          {/* avatar */}
          <div>
            <label className="block text-xs uppercase tracking-widest text-amber-200/80 mb-1.5">Awatar</label>
            <div className="grid grid-cols-8 gap-1">
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => chooseAvatar(a)}
                  className={`aspect-square rounded-lg text-xl flex items-center justify-center transition-all ${
                    avatar === a
                      ? 'bg-amber-400 ring-2 ring-amber-200 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  {a}
                </button>
              ))}
              {uploaded && (
                <button
                  type="button"
                  onClick={() => chooseAvatar(uploaded)}
                  title="Twoje zdjęcie"
                  className={`aspect-square rounded-lg overflow-hidden transition-all ${
                    avatar === uploaded
                      ? 'bg-amber-400 ring-2 ring-amber-200 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                >
                  <Avatar value={uploaded} className="w-full h-full" />
                </button>
              )}
              <button
                type="button"
                onClick={() => avatarFileRef.current && avatarFileRef.current.click()}
                title="Wgraj własne zdjęcie (JPG/PNG) - automatycznie przycięte do koła"
                className="aspect-square rounded-lg text-xl flex items-center justify-center bg-slate-800 border border-dashed border-white/25 hover:border-amber-300 hover:bg-slate-700 transition-all"
              >
                {'\u{1F4F7}'}
              </button>
            </div>
            <input
              ref={avatarFileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={pickAvatarFile}
            />
            {avatarErr && <div className="text-[0.6875rem] text-red-400 mt-1">{avatarErr}</div>}
          </div>

          {/* tryb */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('create')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'create' ? 'btn-primary text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Stwórz stół
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === 'join' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Dołącz do stołu
            </button>
          </div>

          {mode === 'join' && (
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="KOD STOŁU (np. A2KD)"
              className="w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2.5 text-center text-xl font-bold tracking-[0.4em] text-white placeholder-slate-600 placeholder:tracking-[0.4em] placeholder:text-base focus:outline-none focus:ring-2 focus:ring-sky-400/60"
            />
          )}

          <div>
            <label className="block text-xs uppercase tracking-widest text-amber-200/80 mb-1.5">
              Hasło stołu <span className="text-slate-500 normal-case tracking-normal">(opcjonalne)</span>
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value.slice(0, 24))}
              placeholder="kotek1"
              className="w-full rounded-lg bg-slate-800 border border-white/10 px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/60"
            />
          </div>

          {error && <div className="text-red-400 text-sm text-center">{error}</div>}

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl btn-accent text-slate-900 font-bold text-lg transition-colors shadow-lg"
          >
            {mode === 'create' ? 'Stwórz stół \u{1F0CF}' : 'Dołącz \u2192'}
          </button>
        </form>
      </div>

      {showOpts && <SettingsModal onClose={() => setShowOpts(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}
