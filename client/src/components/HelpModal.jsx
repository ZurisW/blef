// "How to play" popup - short rules summary
const RULES = [
  ['Cel', 'Przekonać wszystkich, że w puli (ręce + stół) jest dokładnie tyle kart danej figury, ile zadeklarujesz - nawet jeśli blefujesz.'],
  ['Licytacja', 'Podbijasz na dwa sposoby: więcej sztuk (3×7 > 2×A) albo tyle samo sztuk, ale wyższą figurę (2×K > 2×Q).'],
  ['Stół', 'Po każdym pełnym okrążeniu na stół trafiają 3 odkryte karty - liczą się do puli. Sprawdzenie dokłada jeszcze 5.'],
  ['Sprawdzam!', 'Nie wierzysz? Klikasz i wszystkie karty lecą na stół. Joker liczy się jako każda figura.'],
  ['Kara', 'Kto się pomylił, dobiera kartę (2→3→4→5→6). Przegrany z 6 kartami odpada.'],
  ['Start rundy', 'Nową rundę zaczyna przegrany. Pierwszą - losowo wybrany gracz.'],
  ['Zwycięstwo', 'Ostatni gracz przy stole wygrywa grę.'],
]

export default function HelpModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="w-full max-w-lg m-auto rounded-2xl border border-amber-400/40 bg-slate-900/95 shadow-2xl p-6 pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-extrabold gold-text">Jak się gra?</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
            aria-label="Zamknij"
          >
            {'\u2715'}
          </button>
        </div>
        <div className="space-y-3">
          {RULES.map(([title, text]) => (
            <div key={title} className="flex gap-3">
              <div className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-amber-300 pt-0.5">{title}</div>
              <div className="text-sm text-slate-300 leading-snug">{text}</div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold transition-colors"
        >
          Rozumiem
        </button>
      </div>
    </div>
  )
}
