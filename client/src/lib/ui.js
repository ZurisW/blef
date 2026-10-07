// UI scale: the root font size is bumped by media queries on big screens
// (see index.css) so everything sized in rem - text, spacing, cards - grows
// together. Layout code that works in raw pixels (row fitting, pile geometry)
// multiplies its constants by this factor to stay in sync.
export function uiScale() {
  if (typeof document === 'undefined') return 1
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return fs && !Number.isNaN(fs) ? fs / 16 : 1
}
