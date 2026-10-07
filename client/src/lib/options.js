// Per-player options (localStorage) - accessibility + quality-of-life toggles.
// They live in the lobby gear popup AND in the main menu (landing gear).
const KEY = 'blef.options'

export const DEFAULTS = {
  reveal: true, // popup showing the cards revealed after a full rotation
  noPile: false, // never collapse the table into a pile - rows always visible, heavy overlap
  readablePile: true, // pile with bigger cards + wider spread (rank corners visible)
  compactFooter: false, // shorter bid grid stretched to the full width
  reduceMotion: false, // kill entry/transition animations
}

// keep only known keys (an old uiScale/highlight value must not survive)
function sanitize(raw) {
  const out = {}
  for (const k of Object.keys(DEFAULTS)) {
    if (typeof raw[k] === typeof DEFAULTS[k]) out[k] = raw[k]
  }
  return out
}

export function loadOptions() {
  try {
    return { ...DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function applyOptions(opts) {
  const o = opts || loadOptions()
  document.documentElement.classList.toggle('reduce-motion', !!o.reduceMotion)
}

export function saveOptions(opts) {
  const next = { ...DEFAULTS, ...sanitize(opts) }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode etc. - keep the in-memory copy */
  }
  applyOptions(next)
  return next
}
