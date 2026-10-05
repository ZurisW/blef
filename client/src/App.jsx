import { useEffect, useRef, useState } from 'react'
import Landing from './screens/Landing.jsx'
import Lobby from './screens/Lobby.jsx'
import Game from './screens/Game.jsx'
import { applyTheme, getStoredTheme } from './lib/themes.js'
import { socket } from './lib/socket.js'

export default function App() {
  const [screen, setScreen] = useState('landing')
  const [profile, setProfile] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)

  // restore the chosen table theme on every load
  useEffect(() => {
    applyTheme(getStoredTheme())
  }, [])

  // server-side errors (settings rejected, room gone, ...)
  useEffect(() => {
    const onErr = (msg) => {
      setToast(String(msg || 'Błąd serwera'))
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(''), 4000)
    }
    socket.on('err', onErr)
    return () => {
      socket.off('err', onErr)
      clearTimeout(toastTimer.current)
    }
  }, [])

  let content
  if (screen === 'landing') {
    content = (
      <Landing
        onEnter={(p) => {
          setProfile(p)
          setScreen('lobby')
        }}
      />
    )
  } else if (screen === 'lobby') {
    content = (
      <Lobby
        profile={profile}
        room={profile.room}
        onStart={({ decks, cardBack, players }) => {
          setProfile({ ...profile, players, room: { ...profile.room, decks, cardBack } })
          setScreen('game')
        }}
        onLeave={() => setScreen('landing')}
      />
    )
  } else {
    content = <Game profile={profile} room={profile.room} onExit={() => setScreen('landing')} />
  }

  return (
    <>
      {content}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-xl bg-red-600 text-white font-semibold shadow-lg pop-in max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </>
  )
}
