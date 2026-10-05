import { X } from 'lucide-react'

// Event log panel - slides in from the right via the header button
const STYLE = {
  sys: 'text-slate-400',
  bid: 'text-amber-200',
  table: 'text-sky-300',
  check: 'text-orange-300 font-semibold',
  result: 'text-emerald-300',
  elim: 'text-red-400 font-bold',
  win: 'text-amber-300 font-bold',
}

const ICON = {
  sys: '\u25CB',
  bid: '\u25B2',
  table: '\u25A6',
  check: '\u2753',
  result: '\u2714',
  elim: '\u2716',
  win: '\u{1F3C6}',
}

export default function History({ items, onClose }) {
  const list = [...items].slice(-40).reverse()
  return (
    <div className="slide-in absolute right-3 top-3 bottom-3 w-56 sm:w-60 flex flex-col rounded-xl bg-slate-950/70 border border-white/10 backdrop-blur z-20">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-[11px] uppercase tracking-widest text-amber-200/70">Historia</span>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center"
          title="Zamknij historię"
        >
          <X size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll p-3 space-y-1.5">
        {list.length === 0 && <div className="text-xs text-slate-500">Jeszcze nic się nie wydarzyło...</div>}
        {list.map((h, i) => (
          <div key={items.length - i} className={`text-xs leading-snug flex gap-1.5 ${STYLE[h.type] || 'text-slate-300'}`}>
            <span className="shrink-0 opacity-80">{ICON[h.type] || ''}</span>
            <span>{h.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
