// Tymczasowy test silnika gry (node test-engine.mjs)
import { initGame, reducer, legalMoves, isLegal, chooseAiAction } from './src/lib/game.js'

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

// 6) AI: gra tym co trzyma - bez niebotycznych kwot i ciągłego sprawdzania
const mkCard = (value, suit = '\u2660', isJoker = false) => ({ id: `${value}${suit}${Math.random()}`, value, suit, isJoker })
const mkState = (hand, bid) => ({
  phase: 'bid',
  players: [
    { id: 'you', name: 'Ty', isYou: true, hand: [], cardsCount: 2, isEliminated: false },
    { id: 'b1', name: 'Bot', hand, cardsCount: hand.length, isEliminated: false },
  ],
  decks: 1,
  maxCount: 6,
  deck: [],
  tableCards: [],
  tableBatches: [],
  currentBid: bid,
  turnIndex: 1,
  consecutiveBids: 0,
  round: 1,
  history: [],
  lastRoundLoserId: null,
  checkResult: null,
  room: {},
})

// dwa walety na ręce -> otwarcie tylko 2xJ albo 3xJ (3 = lekki blef +1)
let openOk = true
let saw2 = false
let saw3 = false
for (let i = 0; i < 60; i++) {
  const a = chooseAiAction(mkState([mkCard('J', '\u2660'), mkCard('J', '\u2665')], null))
  if (a.type !== 'BID' || a.value !== 'J' || (a.count !== 2 && a.count !== 3)) openOk = false
  if (a.count === 2) saw2 = true
  if (a.count === 3) saw3 = true
}
assert(openOk, 'bot z 2 waletami otwiera wyłącznie 2xJ albo 3xJ')
assert(saw2 && saw3, `wypada i 2xJ, i 3xJ (2=${saw2}, 3=${saw3})`)

// dwa jokery (dzikie) -> wysoka figura, małe pokrycie: 2xA / 3xA
let jokerOk = true
for (let i = 0; i < 40; i++) {
  const a = chooseAiAction(mkState([mkCard('JOKER', '\u2605', true), mkCard('JOKER', '\u2605', true)], null))
  if (a.type !== 'BID' || a.value !== 'A' || a.count < 2 || a.count > 3) jokerOk = false
}
assert(jokerOk, '2 jokery = otwarcie 2xA albo 3xA')

// 10xA przy pustym stole i ręce bez asów -> bot prawie nigdy nie podbija dalej
const sAbsurd = mkState([mkCard('2', '\u2660'), mkCard('3', '\u2665')], { count: 10, value: 'A', playerId: 'you', playerName: 'Ty' })
sAbsurd.maxCount = 12
sAbsurd.decks = 2
let raises = 0
let illegal = 0
for (let i = 0; i < 50; i++) {
  const a = chooseAiAction(sAbsurd)
  if (a.type === 'BID') {
    raises++
    if (!isLegal(sAbsurd.currentBid, a.count, a.value, 12)) illegal++
  }
}
assert(raises <= 8, `nie podbija 10xA bez kart (${raises}/50 podbić)`)
assert(illegal === 0, 'podbienia AI są legalne (12x max)')

// pewna deklaracja (3 damy na ręce przeciw 2xD) -> raczej podbija, nie sprawdza
const sSure = mkState([mkCard('Q', '\u2665'), mkCard('Q', '\u2666'), mkCard('Q', '\u2663')], { count: 2, value: 'Q', playerId: 'you', playerName: 'Ty' })
let checks = 0
for (let i = 0; i < 50; i++) {
  const a = chooseAiAction(sSure)
  if (a.type === 'CHECK') checks++
  else if (!isLegal(sSure.currentBid, a.count, a.value, 6)) illegal++
}
assert(checks <= 10, `pewnej deklaracji nie sprawdza bez przerwy (${checks}/50)`)
assert(illegal === 0, 'podbienia AI są legalne (6x max)')

console.log(fails === 0 ? '\nWSZYSTKIE TESTY OK' : `\n${fails} TESTÓW NIE PRZESZŁO`)
process.exit(fails === 0 ? 0 : 1)
