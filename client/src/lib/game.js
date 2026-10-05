// ============================================================
// Blef - shared game engine (imported by the client AND the server)
// ============================================================

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const SUITS = ['\u2665', '\u2666', '\u2663', '\u2660'] // ♥ ♦ ♣ ♠
export const MAX_COUNT = 6 // per deck: 4 suits + 2 jokers

export const rankIdx = (v) => RANKS.indexOf(v)

// ---------- Deck ----------
export function createDeck(decks = 1) {
  const deck = []
  for (let d = 0; d < decks; d++) {
    for (const suit of SUITS) {
      for (const value of RANKS) {
        deck.push({ id: `${value}${suit}${decks > 1 ? `-${d}` : ''}`, value, suit, isJoker: false })
      }
    }
    deck.push({ id: `JOKER1-${d}`, value: 'JOKER', suit: '\u2605', isJoker: true })
    deck.push({ id: `JOKER2-${d}`, value: 'JOKER', suit: '\u2605', isJoker: true })
  }
  return shuffle(deck)
}

export function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// ---------- Bid legality ----------
// Raise: more cards, or the same count with a higher rank.
export function isLegal(bid, count, value, max = MAX_COUNT) {
  if (count < 2 || count > max) return false
  if (!bid) return true
  if (count > bid.count) return true
  if (count === bid.count && rankIdx(value) > rankIdx(bid.value)) return true
  return false
}

// All legal raises (null bid = opening declaration)
export function legalMoves(bid, max = MAX_COUNT) {
  const moves = []
  for (let c = 2; c <= max; c++) {
    for (const v of RANKS) {
      if (isLegal(bid, c, v, max)) moves.push({ count: c, value: v })
    }
  }
  return moves
}

// ---------- Active players ----------
export const activePlayers = (players) => players.filter((p) => !p.isEliminated)

function nextActiveIndex(players, current) {
  let idx = (current + 1) % players.length
  while (players[idx].isEliminated) {
    idx = (idx + 1) % players.length
    if (idx === current) break
  }
  return idx
}

// ---------- Seat order helpers ----------
// The players array is one clockwise ring around the table:
// [me, next player clockwise, ..., player just before me].
// Opponents keep their join order = visual seat order (seatPositions),
// so the turn order walks the seats starting next to me going clockwise.
function clockwiseFromMeIndices(n) {
  if (n <= 1) return [0]
  if (n <= 4) return Array.from({ length: n }, (_, i) => i) // small arc: left -> right
  const kTop = Math.ceil(n / 2)
  const kSide = n - kTop
  const rightCount = kSide - Math.ceil(kSide / 2)
  const leftStart = kTop + rightCount
  const leftCol = Array.from({ length: n - leftStart }, (_, i) => leftStart + i)
  const topRow = Array.from({ length: kTop }, (_, i) => i)
  const rightCol = Array.from({ length: rightCount }, (_, i) => kTop + i)
  return [...leftCol, ...topRow, ...rightCol]
}

// Turn order: me first, then the opponents clockwise from me.
// Without a marked "me" (server roster with no host flag) keep join order.
function orderPlayersForTurnOrder(roster) {
  const meIdx = roster.findIndex((p) => p.isYou)
  if (meIdx < 0) return roster
  const me = roster[meIdx]
  const others = roster.filter((p) => !p.isYou)
  if (others.length === 0) return [me]
  const cw = clockwiseFromMeIndices(others.length)
  return [me, ...cw.map((i) => others[i])]
}

// ---------- Game start ----------
export function initGame(profile, room, roster) {
  const decks = room?.decks === 2 ? 2 : 1
  const src =
    Array.isArray(roster) && roster.length >= 2
      ? roster
      : [{ id: 'you', name: profile.nickname || 'Ty', avatar: profile.avatar, isYou: true }]
  // turn order = one clockwise ring: me first, then everyone clockwise from me
  const turnOrder = orderPlayersForTurnOrder(src)
  const players = turnOrder.map((p) => ({ ...p, cardsCount: 2, isEliminated: false, hand: [] }))
  const state = {
    phase: 'bid',
    players,
    decks,
    maxCount: MAX_COUNT * decks,
    deck: [],
    tableCards: [],
    tableBatches: [],
    currentBid: null,
    turnIndex: 0,
    consecutiveBids: 0,
    round: 0,
    history: [],
    lastRoundLoserId: null,
    checkResult: null,
    room,
  }
  return startRound(state, null)
}

// ---------- New round ----------
function startRound(state, starterId) {
  const deck = createDeck(state.decks || 1)
  const act = activePlayers(state.players)

  // starter: random in round 1, then the loser (or the next active seat)
  let starter
  if (starterId) {
    starter = state.players.find((p) => p.id === starterId && !p.isEliminated)
  }
  if (!starter) starter = act[Math.floor(Math.random() * act.length)]

  const players = state.players.map((p) => {
    if (p.isEliminated) return { ...p, hand: [] }
    const hand = []
    for (let i = 0; i < p.cardsCount; i++) {
      if (deck.length > 0) hand.push(deck.pop())
    }
    return { ...p, hand }
  })

  const round = state.round + 1
  return {
    ...state,
    phase: 'bid',
    players,
    deck,
    tableCards: [],
    tableBatches: [],
    currentBid: null,
    turnIndex: state.players.findIndex((p) => p.id === starter.id),
    consecutiveBids: 0,
    round,
    checkResult: null,
    history: [
      ...state.history,
      { type: 'sys', text: `Runda ${round} - zaczyna ${starter.name}` },
    ],
  }
}

// ---------- Reducer ----------
export function reducer(state, action) {
  switch (action.type) {
    // ---- Bid ----
    case 'BID': {
      if (state.phase !== 'bid') return state
      const player = state.players[state.turnIndex]
      if (!isLegal(state.currentBid, action.count, action.value, state.maxCount)) return state

      let { deck, tableCards, tableBatches, consecutiveBids, history } = state
      const bid = { count: action.count, value: action.value, playerId: player.id, playerName: player.name }
      history = [...history, { type: 'bid', text: `${player.name}: ${action.count} \u00D7 ${action.value}` }]

      // a full rotation flips 3 cards onto the table
      const activeCount = activePlayers(state.players).length
      consecutiveBids += 1
      if (consecutiveBids >= activeCount) {
        consecutiveBids = 0
        if (deck.length >= 3) {
          const added = deck.slice(-3)
          deck = deck.slice(0, -3)
          tableCards = [...tableCards, ...added]
          tableBatches = [...tableBatches, { type: 'rotation', cards: added }]
          history = [...history, { type: 'table', text: 'Pełne okrążenie: +3 karty na stół' }]
        } else if (deck.length > 0) {
          const added = deck.slice()
          deck = []
          tableCards = [...tableCards, ...added]
          tableBatches = [...tableBatches, { type: 'rotation', cards: added }]
          history = [...history, { type: 'table', text: `Talia prawie pusta: +${added.length} kart` }]
        } else {
          history = [...history, { type: 'table', text: 'Talia pusta - okrążenie bez nowych kart' }]
        }
      }

      return {
        ...state,
        currentBid: bid,
        consecutiveBids,
        deck,
        tableCards,
        tableBatches,
        history,
        turnIndex: nextActiveIndex(state.players, state.turnIndex),
      }
    }

    // ---- Check ----
    case 'CHECK': {
      if (state.phase !== 'bid' || !state.currentBid) return state
      const challenger = state.players[state.turnIndex]
      const bid = state.currentBid

      // +5 final cards (the last batch lands on the table)
      const deck = [...state.deck]
      const added = []
      for (let i = 0; i < 5 && deck.length > 0; i++) added.push(deck.pop())
      const tableCards = [...state.tableCards, ...added]
      const tableBatches = [...state.tableBatches, { type: 'final', cards: added }]

      // pool = active hands + table cards
      const pool = [...tableCards]
      for (const p of activePlayers(state.players)) pool.push(...p.hand)
      const matching = pool.filter((c) => !c.isJoker && c.value === bid.value)
      const jokers = pool.filter((c) => c.isJoker)
      const found = matching.length + jokers.length

      const bidder = state.players.find((p) => p.id === bid.playerId)
      const bidderWins = found >= bid.count
      const loser = bidderWins ? challenger : bidder
      const winner = bidderWins ? bidder : challenger

      // penalty: +1 card, more than 6 = elimination
      const cardsCount = loser.cardsCount + 1
      const isEliminated = cardsCount > 6
      const players = state.players.map((p) =>
        p.id === loser.id ? { ...p, cardsCount: Math.min(cardsCount, 7), isEliminated } : p
      )

      const checkResult = {
        bid,
        found,
        matchingCount: matching.length,
        jokersCount: jokers.length,
        challengerId: challenger.id,
        loserId: loser.id,
        loserName: loser.name,
        winnerName: winner.name,
        winnerIsYou: winner.isYou,
        loserIsYou: loser.isYou,
        isEliminated,
        cardsCount: Math.min(cardsCount, 7),
        tableCards,
        hands: players.filter((p) => !p.isEliminated).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, isYou: p.isYou, hand: p.hand })),
      }

      let history = [...state.history, { type: 'check', text: `${challenger.name}: SPRAWDZAM! (${bid.count} \u00D7 ${bid.value})` }]
      history = [...history, { type: 'result', text: `Znaleziono ${found}/${bid.count} - przegrywa ${loser.name}` }]
      if (isEliminated) history = [...history, { type: 'elim', text: `${loser.name} odpada z gry!` }]

      const remaining = activePlayers(players)
      if (remaining.length <= 1) {
        history = [...history, { type: 'win', text: `\u{1F3C6} ${remaining[0]?.name ?? '-'} wygrywa całą grę!` }]
        return {
          ...state,
          phase: 'gameOver',
          players,
          deck,
          tableCards,
          tableBatches,
          history,
          checkResult: { ...checkResult, gameWinner: remaining[0]?.name, gameWinnerIsYou: remaining[0]?.isYou },
        }
      }

      return {
        ...state,
        phase: 'roundEnd',
        players,
        deck,
        tableCards,
        tableBatches,
        history,
        checkResult,
        lastRoundLoserId: loser.id,
      }
    }

    // ---- Next round ----
    case 'NEXT_ROUND': {
      if (state.phase !== 'roundEnd') return state
      return startRound(state, state.lastRoundLoserId)
    }

    // ---- Restart after game over ----
    case 'RESTART': {
      if (state.phase !== 'gameOver') return state
      const reset = {
        ...state,
        players: state.players.map((p) => ({ ...p, cardsCount: 2, isEliminated: false, hand: [] })),
        tableCards: [],
        tableBatches: [],
        currentBid: null,
        consecutiveBids: 0,
        lastRoundLoserId: null,
        round: 0,
        checkResult: null,
        history: [{ type: 'sys', text: 'Nowa gra! Wszyscy zaczynają od 2 kart.' }],
      }
      return startRound(reset, null)
    }

    default:
      return state
  }
}

export function cardLabel(c) {
  return c.isJoker ? 'Joker' : `${c.value}${c.suit}`
}

// ---- AI: estimate the chance the current claim is true ----
// AI view: own hand + table cards (incl. jokers). Unknown: other hands + the 5 cards drawn at a check.
function claimTrueChance(state, bid) {
  const me = state.players[state.turnIndex]
  const others = state.players.filter((p) => !p.isEliminated && p.id !== me.id)

  const seenSame =
    me.hand.filter((c) => !c.isJoker && c.value === bid.value).length +
    state.tableCards.filter((c) => !c.isJoker && c.value === bid.value).length
  const seenJokers =
    me.hand.filter((c) => c.isJoker).length + state.tableCards.filter((c) => c.isJoker).length

  const need = bid.count - (seenSame + seenJokers)
  if (need <= 0) return 1 // already seen enough on my side

  const decks = state.maxCount > 6 ? 2 : 1
  const othersCards = others.reduce((s, p) => s + p.cardsCount, 0)
  const finalDraws = Math.min(5, state.deck.length) // those cards join the pool at a check anyway
  const draws = othersCards + finalDraws
  if (draws <= 0) return 0

  // "hits" left outside my hand and the table (rank cards + wild jokers)
  const unseen = othersCards + state.deck.length
  const copiesLeft = Math.max(0, 6 * decks - seenSame) + Math.max(0, 2 * decks - seenJokers)
  const p = Math.min(1, copiesLeft / Math.max(1, unseen))
  return pAtLeast(need, draws, p)
}

// P(X >= need) for X ~ Binomial(n, p)
function pAtLeast(need, n, p) {
  if (need <= 0) return 1
  if (need > n) return 0
  let sum = 0
  let comb = 1 // C(n, 0)
  for (let k = 0; k <= n; k++) {
    if (k >= need) sum += comb * Math.pow(p, k) * Math.pow(1 - p, n - k)
    comb = (comb * (n - k)) / (k + 1)
  }
  return sum
}

export function chooseAiAction(state) {
  const max = state.maxCount || MAX_COUNT
  const bid = state.currentBid
  const me = state.players[state.turnIndex]

  // cards of a rank I can see (jokers count for every rank)
  const knownFor = (value) =>
    me.hand.filter((c) => !c.isJoker && c.value === value).length +
    state.tableCards.filter((c) => !c.isJoker && c.value === value).length +
    me.hand.filter((c) => c.isJoker).length +
    state.tableCards.filter((c) => c.isJoker).length

  if (!bid) {
    const moves = legalMoves(null, max)
    if (Math.random() < 0.8) {
      // open low and honestly - prefer count=2 with rank I have most
      const best = [...moves].sort((a, b) => a.count - b.count || knownFor(b.value) - knownFor(a.value))[0]
      return { type: 'BID', ...best }
    }
    return { type: 'BID', ...moves[Math.floor(Math.random() * moves.length)] }
  }

  const moves = legalMoves(bid, max)
  if (moves.length === 0) return { type: 'CHECK' }

  // check more often the less likely the claim looks
  const pTrue = claimTrueChance(state, bid)
  // strong penalty for high counts - don't blindly push to max
  const highCountPenalty = bid && bid.count >= max * 0.6 ? 0.35 : bid && bid.count >= max * 0.4 ? 0.15 : 0
  const checkProb = Math.min(0.95, (pTrue >= 0.75 ? 0.05 : pTrue >= 0.5 ? 0.15 : pTrue >= 0.3 ? 0.4 : 0.85) + highCountPenalty)
  if (Math.random() < checkProb) return { type: 'CHECK' }

  // raise: prefer moves I can back up, and at high levels prefer SMALLER raises
  if (Math.random() < 0.8) {
    const best = [...moves].sort(
      (a, b) => {
        const needA = Math.max(0, a.count - knownFor(a.value))
        const needB = Math.max(0, b.count - knownFor(b.value))
        if (needA !== needB) return needA - needB
        // at high bids, prefer smaller raise (more conservative)
        if (bid && bid.count >= max * 0.5) return a.count - b.count
        return b.count - a.count
      }
    )[0]
    return { type: 'BID', ...best }
  }
  return { type: 'BID', ...moves[Math.floor(Math.random() * moves.length)] }
}
