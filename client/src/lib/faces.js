// Card face styles - pure vector, no image files.
// Each style: card background, red/black rank colours, border.
// Themes: classic, casino, vegas, gold.
export const FACE_STYLES = {
  // jokerIcon = modular joker signature for the style (letter or glyph)
  classic: {
    label: 'Klasyczny',
    bg: 'linear-gradient(135deg, #ffffff 0%, #ffffff 55%, #e2e8f0 100%)',
    red: '#dc2626',
    black: '#1e293b',
    edge: 'rgba(15,23,42,0.18)',
    jokerIcon: '★',
  },
  fire: {
    label: 'Ognisty',
    bg: 'linear-gradient(135deg, #ffffff 0%, #ffedd5 45%, #fdba74 100%)',
    red: '#ea580c',
    black: '#451a03',
    edge: 'rgba(234,88,12,0.5)',
    jokerIcon: '🔥',
  },
  noir: {
    label: 'Nocny',
    bg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    red: '#fb7185',
    black: '#e2e8f0',
    edge: 'rgba(226,232,240,0.35)',
    jokerIcon: '☾',
  },
  ice: {
    label: 'Lodowy',
    bg: 'radial-gradient(circle at 30% 20%, #ffffff 0%, #e0f2fe 48%, #7dd3fc 100%)',
    red: '#0ea5e9',
    black: '#1e3a8a',
    edge: 'rgba(56,189,248,0.6)',
    jokerIcon: '❄',
  },
  felt: {
    label: 'Kasyno',
    bg: 'radial-gradient(circle at 30% 25%, #0d4a33 0%, #062e1f 70%, #04241a 100%)',
    red: '#fbbf24',
    black: '#e2e8f0',
    edge: 'rgba(251,191,36,0.55)',
    jokerIcon: 'K',
  },
  neon: {
    label: 'Vegas',
    bg: 'radial-gradient(circle at 30% 20%, #2e1065 0%, #12071f 75%, #0a0413 100%)',
    red: '#ff2d95',
    black: '#22d3ee',
    edge: 'rgba(255,45,149,0.55)',
    jokerIcon: 'V',
  },
  gilt: {
    label: 'Złoty',
    bg: 'linear-gradient(135deg, #fffbeb 0%, #fde68a 100%)',
    red: '#b91c1c',
    black: '#78350f',
    edge: 'rgba(146,64,14,0.5)',
    jokerIcon: '♛',
  },
  western: {
    label: 'Western',
    // setting sun + wood grain + darkened, "aged" edges
    bg:
      'radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 52%, rgba(92,47,14,0.38) 100%), repeating-linear-gradient(0deg, rgba(120,53,15,0.06) 0 1.5px, rgba(0,0,0,0) 1.5px 8px), radial-gradient(circle at 50% 25%, #fffbeb 0%, #fde68a 50%, #f59e0b 100%)',
    red: '#b91c1c',
    black: '#3b1f0b',
    edge: 'rgba(120,53,15,0.65)',
    jokerIcon: '🤠',
    // thick, "torn" frame right at the edge - like an old scuffed card
    frame: { color: '#5c2f0e', width: 4, style: 'dashed', inset: 0 },
  },
  royal: {
    label: 'Royal',
    bg: 'radial-gradient(circle at 50% 25%, #ffffff 0%, #ede9fe 45%, #c4b5fd 100%)',
    red: '#be123c',
    black: '#3b0764',
    edge: 'rgba(168,85,247,0.55)',
    jokerIcon: '♔',
    // golden ribbon along the edge - ornate, but never covers the content
    frame: { color: '#b8860b', width: 4, style: 'double', inset: 0 },
  },
}

const KEY = 'blef.face'

let current = 'classic'
try {
  const saved = localStorage.getItem(KEY)
  if (saved && FACE_STYLES[saved]) current = saved
} catch {
  /* no localStorage - keep the default */
}

export function getFaceId() {
  return current
}

export function getFaceStyle() {
  return FACE_STYLES[current] || FACE_STYLES.classic
}

export function setFaceStyle(id) {
  if (!FACE_STYLES[id]) return
  current = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    /* ignore */
  }
}
