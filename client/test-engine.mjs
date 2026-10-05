// Tymczasowy test silnika gry (node test-engine.mjs)
import { initGame, reducer, legalMoves, isLegal } from './src/lib/game.js'

const profile = { nickname: 'Tester', avatar: '\u{1F98A}' }
const room = { code: 'TEST' }
// 5-player test roster (engine no longer ships demo players)
const roster = [
  { id: 'you', name: 'Tester', avatar: '\u{1F98A}', isYou: true },
  { id: 't1', name: 'Bot A', avatar: '\u{1F43B}' },
  { id: 't2', name: 'Bot B', avatar: '\u{1F438}' },
  { id: 't3', name: 'Bot C', avatar: '\u{1F47D}' },
  { id: 't4', name: 'Bot D', avatar: '\u{1F412}' },
]
let fails = 0
const assert = (cond, msg) => {
  if (!cond) { fails++; console.error('FAIL:', msg) } else { console.log('ok:', msg) }
}

let s = initGame(profile, room, roster)
assert(s.players.length === 5, '5 graczy na start')
assert(s.players.every(p => p.hand.length === 2), 'każdy ma 2 karty')
assert(s.deck.length === 44, 'talia 54-10=44, jest ' + s.deck.length)

// 1) Pełne okrążenie = +3 karty na stół
const activeCount = 5
let bids = 0
while (s.tableCards.length === 0 && bids < 20) {
  const cur = s.players[s.turnIndex]
  const moves = legalMoves(s.currentBid)
  const m = moves[0] // zawsze najmocniejszy/legalny pierwszy
  const prev = s.consecutiveBids
  s = reducer(s, { type: 'BID', ...m })
  bids++
  if (bids === activeCount) {
    assert(s.tableCards.length === 3, 'po pełnym okrążeniu +3 karty na stole (jest ' + s.tableCards.length + ')')
    assert(s.consecutiveBids === 0, 'licznik okrążenia wyzerowany')
    assert(s.deck.length === 44 - 3, '3 karty wyszły z talii (jest ' + s.deck.length + ')')
  }
  assert(s.currentBid !== null || s.tableCards.length > 0, 'deklaracja istnieje po BID')
}
assert(s.tableCards.length >= 3, 'stół ma karty po okrążeniu: ' + s.tableCards.length)

// 2) CHECK: +5 kart i poprawne liczenie
const before = s.deck.length
const bidderIdx = s.players.findIndex(p => p.id === s.currentBid.playerId)
const challengerIdx = s.turnIndex
s = reducer(s, { type: 'CHECK' })
assert(s.phase === 'roundEnd' || s.phase === 'gameOver', 'po CHECK faza roundEnd/gameOver: ' + s.phase)
assert(s.tableCards.length >= 8, '+5 kart końcowych na stole (jest ' + s.tableCards.length + ')')
assert(s.deck.length >= before - 5, 'talia zmniejszona o max 5')
assert(s.checkResult.loserId, 'jest przegrany')
const loser = s.players.find(p => p.id === s.checkResult.loserId)
assert(loser.cardsCount === 3, 'przegrany ma 3 karty (2+1), ma ' + loser.cardsCount)

// 3) Kara rośnie do 6, potem eliminacja
let guard = 0
while (s.phase !== 'gameOver' && guard++ < 60) {
  s = reducer(s, { type: 'NEXT_ROUND' })
  assert(s.phase === 'bid', 'nowa runda - faza bid')
  const starter = s.players[s.turnIndex]
  const lastLoser = s.players.find(p => p.id === s.lastRoundLoserId)
  if (lastLoser) assert(starter.id === lastLoser.id || lastLoser.isEliminated, 'nową rundę zaczyna przegrany')
  // każdy zagrywa aż do CHECK
  let inner = 0
  while (s.phase === 'bid' && inner++ < 40) {
    const moves = legalMoves(s.currentBid)
    if (inner % 6 === 5 && s.currentBid) s = reducer(s, { type: 'CHECK' })
    else s = reducer(s, { type: 'BID', ...moves[0] })
  }
  const el = s.players.filter(p => p.isEliminated)
  if (el.length > 0 && guard === 1) {
    console.log('  eliminacja nastąpiła:', el.map(p => `${p.name} (${p.cardsCount})`).join(', '))
  }
}
assert(s.phase === 'gameOver', 'gra się kończy: ' + s.phase)
assert(s.players.filter(p => !p.isEliminated).length === 1, 'zostaje 1 zwycięzca')

// 4) RESTART
s = reducer(s, { type: 'RESTART' })
assert(s.phase === 'bid' && s.players.every(p => p.cardsCount === 2 && !p.isEliminated), 'restart resetuje wszystko')

// 5) Legalność licytacji
assert(isLegal(null, 2, '2'), 'pierwsza deklaracja 2x2 legalna')
assert(!isLegal({ count: 3, value: 'K' }, 3, 'Q'), 'tej samej liczby niższa figura = nielegalne')
assert(isLegal({ count: 3, value: 'K' }, 3, 'A'), 'ta sama liczba wyższa figura = legalne')
assert(isLegal({ count: 3, value: 'K' }, 4, '2'), 'więcej sztuk = legalne')
assert(!isLegal({ count: 4, value: '2' }, 3, 'A'), 'mniej sztuk = nielegalne')
assert(!isLegal({ count: 6, value: 'A' }, 6, 'A'), '6xAs nie da się podbić')

console.log(fails === 0 ? '\nWSZYSTKIE TESTY OK' : `\n${fails} TESTÓW NIE PRZESZŁO`)
process.exit(fails === 0 ? 0 : 1)
