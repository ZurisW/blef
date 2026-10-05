// Modular icon sets - each set is exactly 5 icons: 4 suits + joker.
// Applies to card FACES only (backs have their own patterns and emblems).
// suits order: hearts, diamonds, clubs, spades - always the deck order.
export const ICON_SETS = {
  classic: { label: 'Klasyczne', suits: ['♥', '♦', '♣', '♠'], joker: '★' },
  slots: { label: 'Sloty', suits: ['\u{1F352}', '\u{1F48E}', '\u{1F340}', '\u{1F514}'], joker: '7️⃣' },
  casino: { label: 'Kasyno', suits: ['\u{1F378}', '\u{1F4B5}', '\u{1F3B2}', '\u{1F3B0}'], joker: '\u{1F4B0}' },
  paws: { label: 'Zwierzaki', suits: ['\u{1F43E}', '\u{1F41F}', '\u{1F9B4}', '\u{1F3BE}'], joker: '\u{1F436}' },
  forsa: { label: 'Forsa', suits: ['\u{1F4B8}', '\u{1FA99}', '\u{1F4B3}', '\u{1F9E7}'], joker: '\u{1F911}' },
  lucky: { label: 'Lucky', suits: ['\u{1F340}', '\u{1F3B1}', '\u{1F418}', '\u{1F344}'], joker: '\u{1F91E}' },
  western: { label: 'Western', suits: ['\u{1F335}', '\u{1F40E}', '⭐', '\u{1F9E8}'], joker: '\u{1F920}' },
  royal: { label: 'Królewskie', suits: ['\u{1F5E1}\uFE0F', '\u{1F6E1}\uFE0F', '\u{1F451}', '\u{1F3F0}'], joker: '\u{1F3AD}' },
}

// Default icon sets per face style: casino gets casino glyphs, vegas gets slots
const DEFAULT_FRONT = {
  classic: 'classic',
  fire: 'classic',
  noir: 'classic',
  ice: 'classic',
  felt: 'casino',
  neon: 'slots',
  gilt: 'classic',
  western: 'western',
  royal: 'royal',
}

const KEY = 'blef.icons'
let prefs = { front: {} }
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
  if (saved && typeof saved === 'object') prefs = { front: saved.front || {} }
} catch {
  /* no localStorage - keep the defaults */
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

// ---------- Face (per face style) ----------
export function getFrontSetId(styleId) {
  return ICON_SETS[prefs.front[styleId]] ? prefs.front[styleId] : DEFAULT_FRONT[styleId] || 'classic'
}

export function getFrontSet(styleId) {
  return ICON_SETS[getFrontSetId(styleId)]
}

export function setFrontSet(styleId, setId) {
  if (!ICON_SETS[setId]) return
  prefs.front[styleId] = setId
  persist()
}

// is the glyph an emoji (colour) - corner emoji render at a different size
export function isEmojiGlyph(glyph) {
  return [...String(glyph)].some((ch) => {
    const c = ch.codePointAt(0)
    return c > 0xffff || c === 0xfe0f || c === 0x20e3
  })
}

// rank glyph of a given set (suit = '♥' | '♦' | '♣' | '♠')
export function suitGlyph(set, suit) {
  const i = suit === '\u2665' ? 0 : suit === '\u2666' ? 1 : suit === '\u2663' ? 2 : 3
  return set.suits[i]
}
