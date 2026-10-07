import { useState } from 'react'
import { loadOptions, saveOptions } from '../lib/options'

// Simple on/off switch row
function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center gap-3 rounded-lg border border-white/10 bg-slate-800/70 px-3 py-2 text-left hover:border-white/25 transition-colors"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[0.6875rem] font-semibold text-slate-100">{label}</span>
        {hint && <span className="block text-[0.625rem] text-slate-500">{hint}</span>}
      </span>
      <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-slate-600'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${checked ? 'left-[1.125rem]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

// The personal options list - shared by the lobby gear popup and the main menu.
export default function OptionsSection() {
  const [opts, setOpts] = useState(() => loadOptions())
  const setOpt = (key, value) => setOpts(saveOptions({ ...opts, [key]: value }))

  return (
    <div className="space-y-1.5">
      <ToggleRow
        label="Popup z kartami ze stołu"
        hint="pokazuje karty odsłonięte po pełnym okrążeniu"
        checked={opts.reveal}
        onChange={(v) => setOpt('reveal', v)}
      />
      <ToggleRow
        label="Wyłącz kupkę"
        hint="karty zostają na stole i mocno nachodzą na siebie - bez kupki"
        checked={opts.noPile}
        onChange={(v) => setOpt('noPile', v)}
      />
      <ToggleRow
        label="Czytelna kupka"
        hint="większe karty i szerszy rozstaw - widać figury bez klikania"
        checked={opts.readablePile}
        onChange={(v) => setOpt('readablePile', v)}
      />
      <ToggleRow
        label="Pomniejszony footer"
        hint="niższa siatka licytacji, rozciągnięta na całą szerokość"
        checked={opts.compactFooter}
        onChange={(v) => setOpt('compactFooter', v)}
      />
      <ToggleRow
        label="Ogranicz animacje"
        hint="karty wskakują od razu, bez migotania"
        checked={opts.reduceMotion}
        onChange={(v) => setOpt('reduceMotion', v)}
      />
    </div>
  )
}
