import { useEffect, useState } from 'react'
import { RANKS, isLegal } from '../lib/game'
import { uiScale } from '../lib/ui'

// Bid grid: rows = count, columns = rank (2..A)
// With two decks a toggle switches the range: 2×-6× / 7×-12×
// The grid container has a fixed height (fits 6 rows = 7×-12× page) so the footer never jumps.
export default function BidGrid({ currentBid, selected, onSelect, disabled, maxCount = 6, compact = false }) {
  const [page, setPage] = useState(0)
  const twoPages = maxCount > 6
  const start = page === 0 ? 2 : 7
  const end = page === 0 ? Math.min(6, maxCount) : maxCount
  const rows = []
  for (let c = start; c <= end; c++) rows.push(c)

  // fixed container height = the rows actually shown (5 rows on 1 deck, 6 rows
  // on 2 decks - both pages share the height so switching never jumps),
  // in root pixels so it tracks the UI scale on big screens (h-6 = 1.5rem etc.)
  // compact = shorter rows stretched over the full footer width
  const s = uiScale()
  const rowH = (compact ? 18 : 24) * s // h-6 / h-[1.125rem]
  const gap = (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 4 : 2) * s // gap-0.5 lg:gap-1
  const headerH = (compact ? 14 : 16) * s // rank header row
  const rowCount = twoPages ? 6 : rows.length
  const containerH = Math.round(headerH + rowCount * rowH + (rowCount - 1) * gap + 8 * s) // +8 padding

  // auto page switch: show the range where legal raises live
  useEffect(() => {
    if (!twoPages) return
    const pageHasLegal = (p) => {
      const s = p === 0 ? 2 : 7
      const e = p === 0 ? Math.min(6, maxCount) : maxCount
      for (let c = s; c <= e; c++) {
        for (const v of RANKS) if (isLegal(currentBid, c, v, maxCount)) return true
      }
      return false
    }
    if (!pageHasLegal(page) && pageHasLegal(page === 0 ? 1 : 0)) setPage(page === 0 ? 1 : 0)
  }, [currentBid, twoPages, maxCount, page])

  return (
    <div className={`w-full rounded-xl bg-slate-900/70 border border-white/10 p-1.5 lg:p-2 backdrop-blur transition-opacity ${compact ? '' : 'max-w-[28.75rem] lg:max-w-[40rem]'} ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-1 pl-1">
        <span className="text-[0.5625rem] lg:text-[0.6875rem] uppercase tracking-widest text-amber-200/70">
          Ile sztuk &#8594; / jaka figura &#8595;
        </span>
        {twoPages && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage(0)}
              className={`text-[0.5625rem] lg:text-[0.6875rem] font-bold px-1.5 lg:px-2.5 py-0.5 lg:py-1 rounded border transition-colors ${
                page === 0 ? 'bg-amber-400 border-amber-300 text-slate-900' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              2&times;-6&times;
            </button>
            <button
              type="button"
              onClick={() => setPage(1)}
              className={`text-[0.5625rem] lg:text-[0.6875rem] font-bold px-1.5 lg:px-2.5 py-0.5 lg:py-1 rounded border transition-colors ${
                page === 1 ? 'bg-amber-400 border-amber-300 text-slate-900' : 'bg-slate-800 border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              7&times;-{maxCount}&times;
            </button>
          </div>
        )}
      </div>
      {/* fixed height container - fits 6 rows so switching pages never changes height.
          No overflow clip here: a selected cell scales up (scale-110) and its glow
          on the A column must not be cut off at the right edge. */}
      <div className="w-full" style={{ height: containerH }}>
        <div
          className="grid w-full gap-0.5 lg:gap-1"
          style={{ gridTemplateColumns: '2.1rem repeat(13, minmax(0, 1fr))' }}
        >
          {/* header: ranks */}
          <div />
          {RANKS.map((v) => (
            <div key={v} className="text-center text-[0.5625rem] lg:text-xs font-bold text-amber-200/80 pb-0.5">
              {v}
            </div>
          ))}

          {/* visible rows only - container height stays fixed */}
          {rows.map((count) => (
            <RowCells
              key={count}
              count={count}
              currentBid={currentBid}
              selected={selected}
              onSelect={onSelect}
              disabled={disabled}
              maxCount={maxCount}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function RowCells({ count, currentBid, selected, onSelect, disabled, maxCount, compact }) {
  return (
    <>
      <div className="flex items-center justify-center text-[0.625rem] lg:text-xs font-bold text-amber-300/90 pr-1">
        {count}&#215;
      </div>
      {RANKS.map((value) => {
        const legal = isLegal(currentBid, count, value, maxCount)
        const isCurrent = currentBid && currentBid.count === count && currentBid.value === value
        const isSelected = selected && selected.count === count && selected.value === value

        let cls = `${compact ? 'h-[1.125rem]' : 'h-6'} rounded border text-[0.625rem] lg:text-xs font-semibold transition-all duration-100 flex items-center justify-center `
        if (!legal || disabled) {
          cls += 'bg-white/5 border-white/10 text-white/20 cursor-not-allowed'
        } else if (isSelected) {
          cls += 'bg-amber-400 border-amber-300 text-slate-900 scale-110 shadow-md cursor-pointer z-10'
        } else {
          cls += 'bg-emerald-500/25 border-emerald-400/50 text-white hover:bg-emerald-400/50 hover:scale-110 cursor-pointer'
        }
        if (isCurrent) cls += ' ring-2 ring-amber-400'

        return (
          <button
            key={value}
            type="button"
            disabled={!legal || disabled}
            onClick={() => onSelect({ count, value })}
            className={cls}
            title={`${count} \u00D7 ${value}`}
          >
            {value}
          </button>
        )
      })}
    </>
  )
}