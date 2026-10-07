import { useEffect, useRef, useState } from 'react'
import canvasConfetti from 'canvas-confetti'
import PlayingCard from './PlayingCard'
import Avatar from './Avatar'

// Check animation stages:
// 0 -> "SPRAWDZAM!" banner, 1 -> revealed hands + the table cards (cards view only, everything
// fits on screen without scrolling), 2 -> the normal verdict stage: counting, win/lose and the
// next-round button, pinned to the bottom.
export default function CheckOverlay({ state, onNext, onRestart, canRestart = true, instantGo = false }) {
  const r = state.checkResult
  const [stage, setStage] = useState(0)
  const [rev, setRev] = useState(0) // how many of the final cards already flipped
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!r) return
    setStage(0)
    const t1 = setTimeout(() => setStage(1), 650)
    const t2 = setTimeout(() => setStage(2), 3000) // verdict only after a good look at the cards
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [r])

  // when the verdict panel appears the card view shrinks - keep the table cards in view,
  // they sit right above the panel
  useEffect(() => {
    if (stage === 2 && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [stage])

  // The last cards land face-down (from above), then flip quickly for the thrill
  const finalLen = (() => {
    const b = state.tableBatches?.[state.tableBatches.length - 1]
    return b && b.type === 'final' ? b.cards.length : r.tableCards.length
  })()
  useEffect(() => {
    if (!r) return
    setRev(0)
    let iv = null
    const t0 = setTimeout(() => {
      let i = 0
      iv = setInterval(() => {
        i += 1
        setRev(i)
        if (i >= finalLen) clearInterval(iv)
      }, 160)
    }, 1250)
    return () => {
      clearTimeout(t0)
      if (iv) clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r])

  useEffect(() => {
    if (stage === 2 && r && (r.isEliminated || state.phase === 'gameOver')) {
      canvasConfetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ['#d4af37', '#fbbf24', '#34d399', '#f8fafc'] })
    }
  }, [stage, r, state.phase])

  // Multiplayer: the loser starts the next round, so THEY click.
  // After the click -> 3 s and a new round; without a click -> auto after 5 s.
  // Countdown starts with the cards (stage 1) so the numbers already track the server
  // timer when the buttons appear at stage 2.
  const [left, setLeft] = useState(5)
  const [goClicked, setGoClicked] = useState(false)
  useEffect(() => {
    if (stage !== 1 || !r || state.phase !== 'roundEnd') return
    setGoClicked(false)
    // the countdown mirrors the server delay: everyone advances after 5 s without a click
    setLeft(5)
  }, [stage, r, state.phase])

  useEffect(() => {
    if (stage < 1 || !r || state.phase !== 'roundEnd') return
    if (left <= 0) {
      onNext()
      return
    }
    const t = setTimeout(() => setLeft((l) => l - 1), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stage, r, state.phase])

  if (!r) return null

  const bidOk = r.found >= r.bid.count
  const finalStart = r.tableCards.length - finalLen
  const existing = r.tableCards.slice(0, finalStart)
  const fin = r.tableCards.slice(finalStart)
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640
  // amber ring around the declared rank + jokers (always on)
  const hl = (c) => c.isJoker || c.value === r.bid.value

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex p-4 overflow-y-auto">
      <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-amber-400/40 bg-slate-900/95 shadow-2xl pop-in m-auto overflow-hidden">
        {/* scrollable content (scrollbar hidden - everything fits or is pinned below) */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto hide-scrollbar">
        {/* header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/10 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-300/80">Ktoś nie wierzy...</div>
          <div className="text-3xl sm:text-4xl font-extrabold text-amber-300 mt-1">SPRAWDZAM!</div>
          <div className="text-slate-300 mt-1.5">
            Deklaracja: <span className="font-bold text-white text-lg">{r.bid.count} &#215; {r.bid.value}</span>
            <span className="text-slate-400"> - podbił {r.bid.playerName}</span>
          </div>
        </div>

        {/* stage 1+: everyone lays their cards down first - these get a long look before the verdict */}
        {stage >= 1 && (
          <div className="px-5 py-3 space-y-2 flip-reveal">
            <div className="text-[0.6875rem] uppercase tracking-widest text-slate-400">Karty graczy</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {r.hands.map((h) => (
                <div key={h.id} className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1.5">
                    <Avatar value={h.avatar} className="h-6 w-6 text-lg shrink-0" />
                    <span className={`text-sm font-semibold ${h.isYou ? 'text-amber-300' : 'text-slate-200'}`}>{h.name}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {h.hand.map((c) => (
                      <PlayingCard
                        key={c.id}
                        card={c}
                        size={narrow ? 'sm' : 'md'}
                        className="flip-reveal"
                        highlight={hl(c)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* stage 1+: the 5 closing cards are dealt onto the table - all cards sit in one row,
            the final ones land at the END of the revealed table cards (never on top of them)
            and flip over one by one */}
        {stage >= 1 && (
          <div className="px-5 py-3 flip-reveal">
            <div className="text-[0.6875rem] uppercase tracking-widest text-slate-400 mb-1.5">Karty na stole</div>
            <div className="flex flex-wrap gap-2 min-h-[5.375rem] items-start">
              {existing.map((c) => (
                <PlayingCard key={c.id} card={c} size="md" highlight={hl(c)} />
              ))}
              {fin.map((c, i) => (
                <span key={c.id} className="deal-in" style={{ animationDelay: `${i * 70}ms` }}>
                  {rev > i ? (
                    <PlayingCard
                      card={c}
                      size="md"
                      className="flip-quick"
                      highlight={hl(c)}
                    />
                  ) : (
                    <PlayingCard faceDown size="md" back={state.room?.cardBack || null} />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        </div>

        {/* pinned only at the verdict stage - while the cards are on screen there is no panel,
            so everything is visible without scrolling; the result is always at the bottom */}
        {stage >= 2 && (
          <div className="shrink-0 border-t border-white/10 bg-slate-900/95 px-5 py-3 space-y-2.5">
            <div className={`rounded-xl border p-3 sm:p-4 text-center flip-reveal ${bidOk ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-red-400/50 bg-red-500/10'}`}>
              {/* two columns close together, with labels and numbers on the same rows */}
              <div className="grid grid-cols-[1fr_auto_1fr] gap-x-2 sm:gap-x-5 max-w-[26.25rem] mx-auto items-center text-center">
                <div>
                  <div className="h-5 flex items-center justify-center text-[0.6875rem] uppercase tracking-widest text-slate-400">
                    Znaleziono w puli
                  </div>
                  <div className="text-4xl sm:text-5xl font-extrabold text-white leading-none my-1">{r.found}</div>
                  <div className="h-5 flex items-center justify-center text-xs text-slate-400">
                    {r.matchingCount}{' '}
                    {r.matchingCount === 1 ? 'zwykła' : r.matchingCount >= 2 && r.matchingCount <= 4 ? 'zwykłe' : 'zwykłych'} +{' '}
                    {r.jokersCount} joker{r.jokersCount === 1 ? '' : 'y'}
                  </div>
                </div>
                <div className="text-3xl text-slate-500 self-center">vs</div>
                <div>
                  <div className="h-5 flex items-center justify-center text-[0.6875rem] uppercase tracking-widest text-slate-400">
                    Zadeklarowano
                  </div>
                  <div className="text-4xl sm:text-5xl font-extrabold text-amber-300 leading-none my-1">{r.bid.count}</div>
                  <div className="h-5 flex items-center justify-center text-xs text-slate-400">
                    figura <span className="text-amber-300 font-semibold ml-1">&bdquo;{r.bid.value}&rdquo;</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 font-semibold">
                {bidOk ? (
                  <span className="text-emerald-300">{'\u2713'} Deklaracja się zgadza - rację miał deklarujący!</span>
                ) : (
                  <span className="text-red-300">{'\u2717'} Za mało - deklarujący blefował!</span>
                )}
              </div>
            </div>

              <>
                <div className={`rounded-xl border p-2.5 text-center flip-reveal ${r.isEliminated ? 'border-red-500/60 bg-red-600/15' : 'border-white/15 bg-white/5'}`}>
                  {state.phase === 'gameOver' ? (
                    <div className="text-xl sm:text-2xl font-extrabold text-amber-300">{'\u{1F3C6}'} {r.gameWinner} wygrywa!</div>
                  ) : r.isEliminated ? (
                    <div className="text-xl sm:text-2xl font-extrabold text-red-300">{r.loserName} odpada!</div>
                  ) : (
                    <div className="text-lg sm:text-xl font-bold text-white">
                      Przegrywa <span className="text-amber-300">{r.loserName}</span>
                    </div>
                  )}
                </div>

                {state.phase === 'roundEnd' &&
                  (r.loserIsYou ? (
                    goClicked ? (
                      <div className="w-full py-2.5 rounded-xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-200 text-center font-bold">
                        Nowa runda za {left}&hellip;
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setGoClicked(true)
                          setLeft(3)
                          // online the server starts its 3 s window right away;
                          // local demo waits for the countdown below
                          if (instantGo) onNext()
                        }}
                        className="w-full py-2.5 rounded-xl btn-primary text-white font-bold text-lg transition-colors"
                      >
                        Następna runda &#8594;
                        <span className="text-xs font-medium opacity-80"> &middot; auto za {left}s</span>
                      </button>
                    )
                  ) : (
                    <div className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-center font-medium">
                      Czekamy na {r.loserName}
                      <span className="dot-1">.</span>
                      <span className="dot-2">.</span>
                      <span className="dot-3">.</span>
                      <span className="text-slate-500 text-xs ml-2">({left}s)</span>
                    </div>
                  ))}
                {state.phase === 'gameOver' &&
                  (canRestart ? (
                    <button
                      type="button"
                      onClick={onRestart}
                      className="w-full py-2.5 rounded-xl btn-accent text-slate-900 font-bold text-lg transition-colors"
                    >
                      Zagraj jeszcze raz
                    </button>
                  ) : (
                    <div className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 text-slate-400 text-center font-medium">
                      Nową grę zaczyna gospodarz
                    </div>
                  ))}
              </>
          </div>
        )}
      </div>
    </div>
  )
}
