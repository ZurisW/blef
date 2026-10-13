// Turn alerts - two little helpers for "it is your move and you are not looking":
//   1) a short two-note chime when your turn starts,
//   2) an orange favicon blinking while the tab is hidden / unfocused.
// Both are driven from Game.jsx and toggled by the "Alarm ruchu" option.

// ---------- sound ----------
let ctx = null
function audioCtx() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  } catch {
    return null
  }
}

export function playTurnChime() {
  try {
    const ac = audioCtx()
    if (!ac) return
    const t0 = ac.currentTime
    // quick rising pair (E5 -> B5): reads as "your move!" without being annoying
    ;[659.25, 987.77].forEach((f, i) => {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const t = t0 + i * 0.11
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24)
      osc.connect(gain)
      gain.connect(ac.destination)
      osc.start(t)
      osc.stop(t + 0.26)
    })
  } catch {
    /* bez dźwięku - trudno */
  }
}

// browsers keep audio suspended until the first gesture - arm it early, so the
// chime still plays when the tab is already in the background
if (typeof window !== 'undefined') {
  const prime = () => {
    audioCtx()
    window.removeEventListener('pointerdown', prime)
    window.removeEventListener('keydown', prime)
  }
  window.addEventListener('pointerdown', prime)
  window.addEventListener('keydown', prime)
}

// ---------- favicon ----------
const LINK_ID = 'blef-favicon'

function makeIcon(bg, fg) {
  try {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = bg
    if (typeof g.roundRect === 'function') {
      g.beginPath()
      g.roundRect(0, 0, 64, 64, 14)
      g.fill()
    } else {
      g.fillRect(0, 0, 64, 64)
    }
    g.fillStyle = fg
    g.font = '40px "Segoe UI Emoji", "Segoe UI Symbol", serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('\u2660', 32, 36)
    return c.toDataURL('image/png')
  } catch {
    return ''
  }
}

let ICON_DEFAULT = ''
let ICON_ALERT = ''
let linkEl = null
let timer = null
let armed = false
let showAlert = false
let origTitle = ''

function ensureLink() {
  if (!linkEl || !linkEl.isConnected) {
    linkEl = document.getElementById(LINK_ID)
    if (!linkEl) {
      linkEl = document.createElement('link')
      linkEl.id = LINK_ID
      linkEl.rel = 'icon'
      document.head.appendChild(linkEl)
    }
  }
  return linkEl
}

function setIcon(url) {
  if (!url) return
  ensureLink().href = url
}

const isAway = () => document.hidden || !document.hasFocus()

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  showAlert = false
}

function tick() {
  showAlert = !showAlert
  setIcon(showAlert ? ICON_ALERT : ICON_DEFAULT)
  // the title rides along: the Windows taskbar shows it in the window preview
  // and on hover, so the alert is visible even on a minimized window
  if (origTitle) document.title = showAlert ? '\u2660 ' + origTitle : origTitle
}

// called on every focus/visibility change: blink only while away, solid when back
function evaluate() {
  if (!armed) return
  stopTimer()
  if (isAway()) {
    tick()
    timer = setInterval(tick, 700)
  } else {
    setIcon(ICON_DEFAULT)
    if (origTitle) document.title = origTitle
  }
}

const onVis = () => evaluate()

/**
 * Arm/disarm the "orange flashing favicon" alert.
 * While armed and the tab is hidden or unfocused the icon blinks orange,
 * so a glance at the browser shows the game needs you.
 */
export function setTurnFlash(on) {
  if (!ICON_DEFAULT) {
    ICON_DEFAULT = makeIcon('#0f172a', '#f8fafc') // slate-900 + white spade
    ICON_ALERT = makeIcon('#f97316', '#111111') // orange
  }
  const next = !!on
  if (next === armed) {
    // no state change - just keep the current icon (and create it on first use)
    if (ICON_DEFAULT) setIcon(showAlert ? ICON_ALERT : ICON_DEFAULT)
    return
  }
  armed = next
  if (next) {
    if (!origTitle) origTitle = document.title
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    window.addEventListener('blur', onVis)
    evaluate()
  } else {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('focus', onVis)
    window.removeEventListener('blur', onVis)
    stopTimer()
    setIcon(ICON_DEFAULT)
    if (origTitle) document.title = origTitle
  }
}
