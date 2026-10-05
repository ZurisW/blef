import { FACE_STYLES, getFaceId, getFaceStyle } from '../lib/faces.js'
import { getFrontSetId, getFrontSet, isEmojiGlyph, suitGlyph } from '../lib/icons.js'

const SIZES = {
  xs: { box: 'w-8 h-11 rounded', corner: 'text-[8px]', suitSm: 'text-[7px]', emoji: 'text-[7px]', big: 'text-sm', bigEmoji: 'text-xs' },
  sm: { box: 'w-10 h-14 rounded-md', corner: 'text-[9px]', suitSm: 'text-[8px]', emoji: 'text-[8px]', big: 'text-xl', bigEmoji: 'text-base' },
  md: { box: 'w-14 h-20 rounded-lg', corner: 'text-xs', suitSm: 'text-[10px]', emoji: 'text-[10px]', big: 'text-3xl', bigEmoji: 'text-2xl' },
  lg: { box: 'w-20 h-28 rounded-xl', corner: 'text-sm', suitSm: 'text-xs', emoji: 'text-xs', big: 'text-5xl', bigEmoji: 'text-3xl' },
}

const RED_SUITS = ['\u2665', '\u2666'] // ♥ ♦

// ---------- Emoji tinted to the face style colours ----------
// Emoji carry their own colours, which would clash with the style palette - so
// grayscale + sepia + hue-rotate recolours them to the style's rank colours.
const tintCache = new Map()
export function tintFilter(hex) {
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') return ''
  if (tintCache.has(hex)) return tintCache.get(hex)
  let out = ''
  try {
    const m = hex.slice(1)
    const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m
    const r = parseInt(n.slice(0, 2), 16) / 255
    const g = parseInt(n.slice(2, 4), 16) / 255
    const b = parseInt(n.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let h = 0
    let s = 0
    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      h *= 60
    }
    // sepia yields a ~40° hue - rotate to the target colour and boost saturation
    out = `grayscale(1) sepia(1) hue-rotate(${Math.round(h - 40)}deg) saturate(${Math.min(4, 1 + s * 3).toFixed(2)}) brightness(${(0.62 + l * 0.75).toFixed(2)})`
  } catch {
    out = ''
  }
  tintCache.set(hex, out)
  return out
}

// Decorative style frame - sits right at the card edge (never covers content)
function CardFrame({ frame, size }) {
  if (!frame) return null
  const k = size === 'xs' ? 0.55 : 1
  const mk = (fr, key) => (
    <div
      key={key}
      className="absolute rounded-[5px] pointer-events-none"
      style={{
        inset: `${Math.round((fr.inset ?? 6) * k)}px`,
        border: `${size === 'xs' ? Math.max(2, Math.round((fr.width ?? 3) * 0.6)) : fr.width ?? 3}px ${fr.style ?? 'double'} ${fr.color}`,
      }}
    />
  )
  return (
    <>
      {mk(frame, 'outer')}
      {frame.inner && size !== 'xs' && mk(frame.inner, 'inner')}
    </>
  )
}

// Corner values: just inside the frame (frames hug the edge), so they stay readable
function cornerPad(frame, size) {
  if (!frame) return { top: 'top-1 left-1.5', bottom: 'bottom-1 right-1.5' }
  const extent = Math.max(
    (frame.inset ?? 6) + (frame.width ?? 3),
    frame.inner ? (frame.inner.inset ?? 0) + (frame.inner.width ?? 1) : 0
  )
  if (extent <= 5) return { top: 'top-1.5 left-2', bottom: 'bottom-1.5 right-2' }
  if (size === 'xs') return { top: 'top-1.5 left-2', bottom: 'bottom-1.5 right-2' }
  if (size === 'sm') return { top: 'top-3 left-3', bottom: 'bottom-3 right-3' }
  return { top: 'top-3 left-3.5', bottom: 'bottom-3 right-3.5' }
}

// Card back designs - every pattern has its OWN motif (not a repeating grid).
// A table may also use its own image from a URL.
export const BACK_DESIGNS = {
  gold: {
    backgroundColor: '#14243d',
    // golden glow + thin diagonals (like crown engraving)
    image:
      'radial-gradient(circle at 50% 40%, rgba(212,175,55,0.25), transparent 65%), repeating-linear-gradient(45deg, rgba(212,175,55,0.10) 0 2px, transparent 2px 7px)',
    border: 'border-amber-600/40',
    inner: 'border-amber-500/45',
    emblem: '\u265B', // crown
    emblemColor: '#fcd34d',
  },
  crimson: {
    backgroundColor: '#3d1520',
    // the old lattice - the only checkered back in the deck
    image:
      'repeating-linear-gradient(45deg, rgba(255,255,255,0.11) 0 3px, transparent 3px 8px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.11) 0 3px, transparent 3px 8px)',
    border: 'border-rose-600/50',
    inner: 'border-rose-400/50',
    emblem: '\u2665', // heart
    emblemColor: '#fda4af',
  },
  teal: {
    backgroundColor: '#0d2f2b',
    // roulette wheel spokes
    image:
      'repeating-conic-gradient(from 0deg at 50% 45%, rgba(255,255,255,0.08) 0 9deg, transparent 9deg 18deg)',
    border: 'border-teal-600/50',
    inner: 'border-teal-400/50',
    emblem: '\u2726', // star
    emblemColor: '#99f6e4',
  },
  casino: {
    backgroundColor: '#0a3a2c',
    // green felt + gold rings like a poker chip
    image:
      'radial-gradient(circle at 50% 42%, rgba(251,191,36,0.16), transparent 60%), repeating-radial-gradient(circle at 50% 50%, rgba(251,191,36,0.10) 0 14px, transparent 14px 17px)',
    border: 'border-amber-500/60',
    inner: 'border-amber-400/60',
    emblem: '\u25C6', // diamond - like a chip
    emblemColor: '#fcd34d',
  },
  vegas: {
    backgroundColor: '#1b0b33',
    // pink neon sheen + cyan flashes (different angle than the golden back)
    image:
      'radial-gradient(circle at 50% 35%, rgba(255,79,163,0.28), transparent 60%), repeating-linear-gradient(-45deg, rgba(34,211,238,0.13) 0 3px, transparent 3px 10px)',
    border: 'border-fuchsia-500/55',
    inner: 'border-cyan-400/50',
    emblem: '\u2605', // star - vegas neon
    emblemColor: '#ff4fa3',
  },
  lucky: {
    backgroundColor: '#123324',
    // two green auroras - no lines at all
    image:
      'radial-gradient(circle at 30% 30%, rgba(134,239,172,0.20), transparent 55%), radial-gradient(circle at 70% 70%, rgba(134,239,172,0.16), transparent 50%)',
    border: 'border-emerald-600/55',
    inner: 'border-emerald-400/55',
    emblem: '\u2618', // clover - luck
    emblemColor: '#86efac',
  },
  noir: {
    backgroundColor: '#17181c',
    // vertical stripes - like a classic casino back
    image: 'repeating-linear-gradient(90deg, rgba(226,232,240,0.13) 0 2px, transparent 2px 9px)',
    border: 'border-slate-500/40',
    inner: 'border-slate-400/45',
    emblem: '\u2660', // spade
    emblemColor: '#e2e8f0',
  },
  royal: {
    backgroundColor: '#2a1250',
    // golden halo + elliptical rings - like crown engraving
    image:
      'radial-gradient(ellipse at 50% 38%, rgba(250,204,21,0.20), transparent 65%), repeating-radial-gradient(ellipse at 50% 45%, rgba(250,204,21,0.10) 0 12px, transparent 12px 15px)',
    border: 'border-purple-500/50',
    inner: 'border-amber-400/45',
    emblem: '\u269C', // fleur-de-lis - royal
    emblemColor: '#fde68a',
  },
  ice: {
    backgroundColor: '#0e3f5c',
    // icy glow + horizontal bands like layers of ice
    image:
      'radial-gradient(circle at 50% 35%, rgba(125,211,252,0.28), transparent 62%), repeating-linear-gradient(0deg, rgba(186,230,253,0.11) 0 2px, transparent 2px 9px)',
    border: 'border-sky-500/50',
    inner: 'border-sky-300/50',
    emblem: '\u2744', // snowflake
    emblemColor: '#bae6fd',
  },
}

// Playful clown joker - drawn as vectors, colours come from the face style
function JesterArt({ accent, className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {/* face */}
      <circle cx="32" cy="41" r="14.5" fill="#fde7cf" stroke="rgba(0,0,0,0.3)" strokeWidth="1.2" />
      {/* jester hat - three points */}
      <path
        d="M12 27 C7 16 4 11 4 9 C10 11 15 16 18 22 C22 17 27 8 32 4 C37 8 42 17 46 22 C49 16 54 11 60 9 C60 11 57 16 52 27 C44 22 38 23 32 23 C26 23 20 22 12 27 Z"
        fill={accent}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {/* bells on the tips */}
      <circle cx="4" cy="9" r="3.6" fill="#fcd34d" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
      <circle cx="32" cy="4" r="3.6" fill="#fcd34d" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
      <circle cx="60" cy="9" r="3.6" fill="#fcd34d" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
      {/* furrowed brows - mischievous look */}
      <path d="M23 35.5 L30 39.5" stroke="#3b1d1d" strokeWidth="3" strokeLinecap="round" />
      <path d="M41 35.5 L34 39.5" stroke="#3b1d1d" strokeWidth="3" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="27.5" cy="42.5" r="2.1" fill="#3b1d1d" />
      <circle cx="36.5" cy="42.5" r="2.1" fill="#3b1d1d" />
      {/* smug smile */}
      <path d="M23.5 47.5 Q32 54 40.5 47.5" fill="none" stroke="#7f1d1d" strokeWidth="2.4" strokeLinecap="round" />
      {/* harlequin diamonds on the cheeks */}
      <path d="M21 43 l3 3 -3 3 -3 -3 Z" fill={accent} opacity="0.85" />
      <path d="M43 43 l3 3 -3 3 -3 -3 Z" fill={accent} opacity="0.85" />
    </svg>
  )
}

function Corner({ value, glyph, color, s, className }) {
  return (
    <div
      className={`absolute ${className} flex flex-col items-center leading-none font-black ${s.corner}`}
      style={{ color }}
    >
      <span className="tracking-tight">{value}</span>
      {glyph && <span className={`mt-px ${s.suitSm}`}>{glyph}</span>}
    </div>
  )
}

export default function PlayingCard({ card, size = 'md', faceDown = false, highlight = false, back = null, face = null, className = '', style }) {
  const s = SIZES[size] || SIZES.md
  // if the caller positions the card (e.g. absolute), do not add relative
  const posCls = className.includes('absolute') ? '' : 'relative'

  // ---------- Back ----------
  if (faceDown || !card) {
    const customUrl = back && back.kind === 'url' && back.value ? back.value.trim() : ''
    const presetId = back && back.kind === 'preset' ? back.value : 'gold'
    const preset = BACK_DESIGNS[presetId] || BACK_DESIGNS.gold
    const emblem = preset.emblem
    const emblemEmoji = isEmojiGlyph(emblem)

    return (
      <div
        className={`${s.box} ${posCls} overflow-hidden shadow-lg shadow-black/40 ring-1 ring-black/30 select-none border ${customUrl ? 'border-amber-600/50' : preset.border} ${className}`}
        style={
          customUrl
            ? { backgroundImage: `url("${customUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#14243d', ...style }
            : { backgroundColor: preset.backgroundColor, backgroundImage: preset.image, ...style }
        }
      >
        <div className={`absolute inset-[3px] rounded-[3px] border ${customUrl ? 'border-amber-500/40' : preset.inner}`} />
        {!customUrl && emblem && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`${emblemEmoji ? s.bigEmoji : s.big} leading-none font-black drop-shadow-[0_1px_3px_rgba(0,0,0,0.55)]`}
              style={{ color: preset.emblemColor }}
            >
              {emblem}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ---------- Face style + its icon set (ranks, joker) ----------
  const fid = face && FACE_STYLES[face] ? face : getFaceId()
  const f = FACE_STYLES[fid] || getFaceStyle()
  const set = getFrontSet(fid)
  const emoji = getFrontSetId(fid) !== 'classic'

  // ---------- Joker ----------
  if (card.isJoker) {
    const jpad = cornerPad(f.frame, size)
    return (
      <div
        className={`${s.box} ${posCls} overflow-hidden shadow-lg shadow-black/40 select-none border-2 ${highlight ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 shadow-amber-500/40' : ''} ${className}`}
        style={{ background: f.bg, borderColor: f.red, ...style }}
      >
        <CardFrame frame={f.frame} size={size} />
        {/* joker signature from the chosen icon set (on xs it is too tight - skipped) */}
        {size !== 'xs' && (
          <>
            <div
              className={`absolute ${jpad.top} ${isEmojiGlyph(set.joker) ? s.emoji : s.corner}`}
              style={{ color: f.red, filter: isEmojiGlyph(set.joker) ? tintFilter(f.red) : undefined }}
            >
              {set.joker}
            </div>
            <div
              className={`absolute ${jpad.bottom} rotate-180 ${isEmojiGlyph(set.joker) ? s.emoji : s.corner}`}
              style={{ color: f.red, filter: isEmojiGlyph(set.joker) ? tintFilter(f.red) : undefined }}
            >
              {set.joker}
            </div>
          </>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-px">
          <JesterArt accent={f.red} className="w-[66%] max-h-[64%] drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
          {size !== 'xs' && (
            <span
              className={`font-black leading-none tracking-[0.2em] rotate-[-5deg] -mt-1.5 relative ${
                size === 'lg' ? 'text-[10px]' : size === 'md' ? 'text-[8px]' : 'text-[7px]'
              }`}
              style={{ color: f.black }}
            >
              JOKER
            </span>
          )}
        </div>
      </div>
    )
  }

  // ---------- Front ----------
  const color = RED_SUITS.includes(card.suit) ? f.red : f.black
  const glyph = suitGlyph(set, card.suit)
  const pad = cornerPad(f.frame, size)

  return (
    <div
      className={`${s.box} ${posCls} overflow-hidden shadow-lg shadow-black/40 select-none border ${highlight ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900 shadow-amber-500/40' : ''} ${className}`}
      style={{ background: f.bg, borderColor: f.edge, ...style }}
    >
      <CardFrame frame={f.frame} size={size} />
      {/* emoji sets keep only the value - corner emoji overlapped the centre */}
      <Corner value={card.value} glyph={emoji ? null : glyph} color={color} s={s} className={pad.top} />
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={`${emoji ? s.bigEmoji : s.big} leading-none drop-shadow-[0_1px_0_rgba(0,0,0,0.08)]`}
          style={{ color, ...(emoji ? { filter: tintFilter(color) } : {}) }}
        >
          {glyph}
        </span>
      </div>
      <Corner value={card.value} glyph={emoji ? null : glyph} color={color} s={s} className={`${pad.bottom} rotate-180`} />
    </div>
  )
}
