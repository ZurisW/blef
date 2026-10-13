// Per-player options (localStorage) - accessibility + quality-of-life toggles.
// They live in the lobby gear popup AND in the main menu (landing gear).
const KEY = 'blef.options'

export const DEFAULTS = {
  reveal: true, // popup showing the cards revealed after a full rotation
  pile: true, // table cards collapse into a compact pile; off = spread out left to right
  compactFooter: false, // shorter bid grid stretched to the full width
  reduceMotion: false, // kill entry/transition animations
  turnAlert: true, // chime on your move + orange flashing favicon while you are away
  bigCount: false, // big card-count badge next to every seat (desktop too)
  uiScaleManual: false, // manual UI scale slider instead of the automatic screen-based size
  uiScale: 100, // 80..200 (% of the standard 16px root - only used when manual)
  cardScale: 100, // 80..200 (%) - zoom applied to every card
}

// keep only known keys (an old highlight value must not survive)
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
  const root = document.documentElement
  root.classList.toggle('reduce-motion', !!o.reduceMotion)
  // manual UI scale: the root font-size drives everything sized in rem.
  // Unset = the automatic media-query sizes from index.css (the old behaviour).
  if (o.uiScaleManual) root.style.fontSize = `${(16 * o.uiScale) / 100}px`
  else root.style.fontSize = ''
  // card scale rides along with the manual switch - one "Ręczna skala" arms both
  root.style.setProperty('--card-scale', String(o.uiScaleManual ? o.cardScale / 100 : 1))
}

export function saveOptions(opts) {
  let next = { ...DEFAULTS, ...sanitize(opts) }
  const clamp = (v) => Math.min(200, Math.max(80, Math.round(v)))
  next.uiScale = clamp(next.uiScale)
  next.cardScale = clamp(next.cardScale)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* private mode etc. - keep the in-memory copy */
  }
  applyOptions(next)
  // let open screens react at once (e.g. the in-game settings change the table live)
  try {
    window.dispatchEvent(new CustomEvent('blef:options', { detail: next }))
  } catch {
    /* non-browser env - nothing to notify */
  }
  return next
}
