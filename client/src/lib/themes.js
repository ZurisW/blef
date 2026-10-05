// Table themes: felt background + button/accent colors applied as CSS variables.
// Everything is a personal preference stored in localStorage (like card fronts).

const THEMES = {
  classic: {
    label: 'Klasyczny',
    felt: 'radial-gradient(ellipse at 50% 38%, #237a5b 0%, #1b4d3e 45%, #0f3527 100%)',
    gold: '#d4af37',
    primary: '#059669',
    primaryH: '#047857',
    accentBtn: '#f59e0b',
    accentBtnH: '#d97706',
  },
  crimson: {
    label: 'Kasyno',
    felt: 'radial-gradient(ellipse at 50% 38%, #7f1d1d 0%, #5c1515 48%, #2a0a0a 100%)',
    gold: '#e8c468',
    primary: '#dc2626',
    primaryH: '#b91c1c',
    accentBtn: '#f59e0b',
    accentBtnH: '#d97706',
  },
  royal: {
    label: 'Królewski',
    felt: 'radial-gradient(ellipse at 50% 38%, #1e3a8a 0%, #172554 48%, #0b1220 100%)',
    gold: '#d4af37',
    primary: '#2563eb',
    primaryH: '#1d4ed8',
    accentBtn: '#eab308',
    accentBtnH: '#ca8a04',
  },
  midnight: {
    label: 'Vegas noc',
    felt: 'radial-gradient(ellipse at 50% 38%, #5b21b6 0%, #3b0764 48%, #17102e 100%)',
    gold: '#fbbf24',
    primary: '#7c3aed',
    primaryH: '#6d28d9',
    accentBtn: '#f472b6',
    accentBtnH: '#db2777',
  },
  ice: {
    label: 'Lodowy',
    felt: 'radial-gradient(ellipse at 50% 38%, #0e7490 0%, #155e75 48%, #082f3a 100%)',
    gold: '#67e8f9',
    primary: '#0891b2',
    primaryH: '#0e7490',
    accentBtn: '#38bdf8',
    accentBtnH: '#0ea5e9',
  },
  gold: {
    label: 'Złoty',
    felt: 'radial-gradient(ellipse at 50% 38%, #292524 0%, #1c1917 48%, #0c0a09 100%)',
    gold: '#fbbf24',
    primary: '#d97706',
    primaryH: '#b45309',
    accentBtn: '#fbbf24',
    accentBtnH: '#f59e0b',
  },
}

const STORAGE_KEY = 'blef.theme'

// --- small color helpers for the custom theme ---
function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function parseHex(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

function toHex(rgb) {
  return '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join('')
}

function shade(hex, amount) {
  const [r, g, b] = parseHex(hex)
  const t = amount > 0 ? 255 : 0
  const p = Math.abs(amount)
  return toHex([r + (t - r) * p, g + (t - g) * p, b + (t - b) * p])
}

// One felt color -> a radial "table cloth" gradient (light center, dark edges)
function feltFrom(color) {
  return `radial-gradient(ellipse at 50% 38%, ${shade(color, 0.18)} 0%, ${color} 48%, ${shade(color, -0.45)} 100%)`
}

function customTheme(feltColor, accentColor) {
  return {
    label: 'Własny',
    felt: feltFrom(feltColor),
    gold: accentColor,
    primary: accentColor,
    primaryH: shade(accentColor, -0.16),
    accentBtn: accentColor,
    accentBtnH: shade(accentColor, -0.16),
  }
}

// Resolve stored choice ({id, felt?, accent?}) into a full theme object
export function resolveTheme(stored) {
  if (!stored || stored.id === 'custom') {
    const felt = stored?.felt || '#1e7a5b'
    const accent = stored?.accent || '#f59e0b'
    return customTheme(felt, accent)
  }
  return THEMES[stored.id] || THEMES.classic
}

export function getStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore invalid storage
  }
  return { id: 'classic' }
}

export function saveTheme(stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // ignore quota errors
  }
}

// Push the theme into CSS variables - called on boot and whenever the user picks one
export function applyTheme(stored) {
  const t = resolveTheme(stored)
  const s = document.documentElement.style
  s.setProperty('--felt', t.felt)
  s.setProperty('--gold', t.gold)
  s.setProperty('--btn-primary', t.primary)
  s.setProperty('--btn-primary-h', t.primaryH)
  s.setProperty('--btn-accent', t.accentBtn)
  s.setProperty('--btn-accent-h', t.accentBtnH)
}

export { THEMES }
