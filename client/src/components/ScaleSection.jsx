import { useState } from 'react'
import { loadOptions, saveOptions } from '../lib/options'
import { ToggleRow } from './OptionsSection.jsx'

// Slider row: 1% steps between 80% and 200% with a live readout
function ScaleSlider({ label, hint, value, disabled, onChange }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-slate-800/70 px-3 py-2 ${disabled ? 'opacity-45' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[0.6875rem] font-semibold text-slate-100">{label}</span>
          {hint && <span className="block text-[0.625rem] text-slate-500">{hint}</span>}
        </span>
        <span className="text-[0.6875rem] font-bold text-amber-300 tabular-nums w-10 text-right">{value}%</span>
      </div>
      <input
        type="range"
        min={80}
        max={200}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full mt-1.5 accent-amber-400 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  )
}

// Scale settings at the very bottom of the options tab.
// One switch ("Ręczna skala") arms BOTH sliders - UI and cards are one
// feature: unchecked = everything sizes itself to the screen like always.
// 100% = the standard size.
export default function ScaleSection() {
  const [opts, setOpts] = useState(() => loadOptions())
  const patch = (p) => setOpts(saveOptions({ ...opts, ...p }))

  return (
    <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
      <div className="text-[0.625rem] uppercase tracking-widest text-amber-200/80">Skala</div>
      <ToggleRow
        label="Ręczna skala"
        hint="powiększa interfejs i karty razem - bez tego wszystko dobiera się samo"
        checked={opts.uiScaleManual}
        onChange={(v) => patch({ uiScaleManual: v })}
      />
      <ScaleSlider
        label="Interfejs"
        hint="tekst, przyciski i całe menu"
        value={opts.uiScale}
        disabled={!opts.uiScaleManual}
        onChange={(v) => patch({ uiScale: v })}
      />
      <ScaleSlider
        label="Karty"
        hint="same karty na stole, w ręce i w podglądach"
        value={opts.cardScale}
        disabled={!opts.uiScaleManual}
        onChange={(v) => patch({ cardScale: v })}
      />
    </div>
  )
}
