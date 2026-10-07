import { io } from 'socket.io-client'

// One shared connection for the whole app.
// In development the API runs on :3001; in production the server serves this
// very build, so connecting to the same origin is enough.
// With Vite proxy, we connect to the same origin.
const URL = import.meta.env.DEV ? undefined : undefined

export const socket = io(URL, { 
  path: '/blef/socket.io',
  reconnection: true, 
  reconnectionAttempts: 20,
  transports: ['polling', 'websocket'],
  withCredentials: false
})

export const isConnected = () => socket.connected

// Promise wrapper around an ack callback - resolves with the server's response
// or with an error object when the server stays silent.
export function emitAck(event, payload = {}, timeout = 6000) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({ ok: false, err: 'Serwer nie odpowiada' })
      }
    }, timeout)
    socket.emit(event, payload, (res) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(res && typeof res === 'object' ? res : { ok: false, err: 'Nieoczekiwana odpowiedź' })
    })
  })
}
