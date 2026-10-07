// Per-player options (localStorage) - accessibility + quality-of-life toggles.
// They live below the table/card customisation in the lobby gear popup.
const KEY = 'blef.options'

export const DEFAULTS = {
  reveal: true, // popup showing the cards revealed after a full rotation
  highlight: true, // amber ring around the declared rank when a check happens
  reduceMotion: false, // kill entry/transition animations
  uiScale: 'auto', // 'auto' = follow screen size, or a fixed px root size
}

export function loadOptions() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function applyOptions(opts) {
  const o = opts || loadOptions()
  const el = document.documentElement
  el.classList.toggle('reduce-motion', !!o.reduceMotion)
  // fixed scale overrides the media queries; 'auto' hands control back to CSS
  el.style.fontSize = !o.uiScale || o.uiScale === 'auto' ? '' : o.uiScale
}

export function saveOptions(opts) {
  const next = { ...DEFAULTS, ...opts }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode etc. - keep the in-memory copy */
  }
  applyOptions(next)
  return next
}
