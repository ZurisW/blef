// Who I am at the table - lets a player who left (or just reloaded the page)
// rejoin their seat, even in the middle of a game.
//   blef.seat   -> auto-rejoin record {code, name, avatar, password, token}
//   blef.tokens -> code -> token, survives an explicit leave so the join form
//                  can still hand the old seat back to its owner
const SEAT_KEY = 'blef.seat'
const TOKENS_KEY = 'blef.tokens'

export function loadSeat() {
  try {
    const r = JSON.parse(localStorage.getItem(SEAT_KEY) || 'null')
    return r && r.code && r.token ? r : null
  } catch {
    return null
  }
}

export function saveSeat(seat) {
  try {
    if (seat && seat.code && seat.token) localStorage.setItem(SEAT_KEY, JSON.stringify(seat))
  } catch {
    /* ignoruj */
  }
}

export function clearSeat() {
  try {
    localStorage.removeItem(SEAT_KEY)
  } catch {
    /* ignoruj */
  }
}

export function saveToken(code, token) {
  try {
    if (!code || !token) return
    const all = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}')
    all[code] = token
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all))
  } catch {
    /* ignoruj */
  }
}

export function loadToken(code) {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}')[code] || ''
  } catch {
    return ''
  }
}
