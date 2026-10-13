import { useEffect, useRef, useState } from 'react'
import Landing from './screens/Landing.jsx'
import Lobby from './screens/Lobby.jsx'
import Game from './screens/Game.jsx'
import { applyTheme, getStoredTheme } from './lib/themes.js'
import { applyOptions } from './lib/options.js'
import { socket, emitAck } from './lib/socket.js'
import { clearSeat, loadSeat, saveSeat, saveToken } from './lib/seat.js'

export default function App() {
  const [screen, setScreen] = useState('landing')
  const [profile, setProfile] = useState(null)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(null)
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  const showToast = (msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 4000)
  }

  // restore the chosen table theme + personal options on every load
  useEffect(() => {
    applyTheme(getStoredTheme())
    applyOptions()
  }, [])

  // ---- auto (re)join: on the first load and after every socket reconnect,
  // go back to the remembered seat - a reload or a network blip mid-game no
  // longer locks the player out (the seat token is checked server-side) ----
  useEffect(() => {
    let busy = false
    const rejoin = async () => {
      const seat = loadSeat()
      if (!seat || busy) return
      busy = true
      try {
        const res = await emitAck('table:join', {
          code: seat.code,
          name: seat.name,
          avatar: seat.avatar,
          password: seat.password,
          token: seat.token,
        })
        // the seat changed while the answer was in flight (the player created
        // or joined another table in the meantime) - drop this stale response,
        // it must not drag anyone back to the old table
        const cur = loadSeat()
        if (!cur || cur.code !== seat.code || cur.token !== seat.token) return
        if (!res.ok) {
          // a real "no" from the server = the seat is gone; a silent timeout
          // (server restarting) keeps the seat - the next 'connect' retries
          const serverSaidNo = socket.connected && !!res.err && res.err !== 'Serwer nie odpowiada'
          if (!serverSaidNo) return
          clearSeat()
          if (screenRef.current !== 'landing') {
            showToast(`Nie wrócisz do stołu: ${res.err}`)
            setScreen('landing')
          }
          return
        }
        saveSeat({ ...seat, token: res.token || seat.token })
        saveToken(res.room.code, res.token)
        setProfile({
          nickname: seat.name,
          avatar: seat.avatar,
          online: true,
          youId: res.youId,
          players: res.room.players,
          room: { ...res.room, password: seat.password },
        })
        setScreen(res.room.status === 'game' ? 'game' : 'lobby')
      } catch {
        /* cisza - spróbuje przy kolejnym reconnectcie */
      } finally {
        busy = false
      }
    }
    socket.on('connect', rejoin)
    if (socket.connected) rejoin()
    return () => socket.off('connect', rejoin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // proof of life: the server hands a silent seat over to the bot after ~45 s,
  // so a frozen/backgrounded tab cannot stall the table. Returning to the tab
  // pings immediately - no waiting for the next tick.
  useEffect(() => {
    const alive = () => {
      if (socket.connected) socket.emit('seat:alive')
    }
    const iv = setInterval(alive, 12000)
    const onVis = () => {
      if (!document.hidden) alive()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  // server-side errors (settings rejected, room gone, ...)
  useEffect(() => {
    const onErr = (msg) => {
      setToast(String(msg || 'Błąd serwera'))
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(''), 4000)
    }
    // another tab took the seat back - this one quietly returns to the menu
    // (the seat record stays: it belongs to the tab that is now playing)
    const onKicked = () => {
      if (screenRef.current !== 'landing') setScreen('landing')
    }
    socket.on('err', onErr)
    socket.on('kicked', onKicked)
    return () => {
      socket.off('err', onErr)
      socket.off('kicked', onKicked)
      clearTimeout(toastTimer.current)
    }
  }, [])

  let content
  if (screen === 'landing') {
    content = (
      <Landing
        onEnter={(p) => {
          setProfile(p)
          // a rejoin straight into a running game skips the lobby
          setScreen(p.room?.status === 'game' ? 'game' : 'lobby')
        }}
      />
    )
  } else if (screen === 'lobby') {
    content = (
      <Lobby
        profile={profile}
        room={profile.room}
        onStart={({ decks, players }) => {
          setProfile({ ...profile, players, room: { ...profile.room, decks } })
          setScreen('game')
        }}
        onLeave={() => {
          // leaving the lobby must tell the server too - otherwise the seat
          // stays bound and every next create/join fails with "przy innym stole"
          if (profile?.online) socket.emit('table:leave')
          clearSeat()
          setScreen('landing')
        }}
      />
    )
  } else {
    content = (
      <Game
        profile={profile}
        room={profile.room}
        onExit={() => {
          // an explicit leave stops the auto-rejoin - the seat token stays
          // saved, so the join form can still hand the seat back later
          clearSeat()
          setScreen('landing')
        }}
      />
    )
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
