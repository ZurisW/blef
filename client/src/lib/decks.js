// ============================================================
// Własne talie - upload całego folderu albo ZIP-a z obrazkami kart.
// Nazwa pliku = karta: QS.svg, 10H.png, AS.svg, "KING HEARTS.svg",
// "AS KARO.svg", joker.svg... Rozpoznajemy 2-10/J/Q/K/A w każdym
// kolorze (także po angielsku i po polsku). Karty, których brakuje
// w talii, renderują się standardowym stylem - talia może być
// niepełna (np. same figury).
// Biblioteka talii siedzi w IndexedDB - localStorage nie pomieści
// kilkunastu MB dataURL-i.
// ============================================================
import { createContext, useContext } from 'react'

// ---------- klucze kart ----------
const SUIT_KEY = { '\u2660': 'S', '\u2665': 'H', '\u2666': 'D', '\u2663': 'C' } // ♠ ♥ ♦ ♣
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']
export const ALL_CARD_KEYS = [
  ...RANKS.flatMap((r) => Object.values(SUIT_KEY).map((s) => r + s)),
  'JOKER',
]

// engine card -> deck key ("QS", "10H", "JOKER", ...); null = nie do rozpoznania
export function cardKey(card) {
  if (!card) return null
  if (card.isJoker) return 'JOKER'
  const s = SUIT_KEY[card.suit]
  return s ? `${card.value}${s}` : null
}

// aktualna talia stołu - PlayingCard czyta ją z kontekstu
export const DeckContext = createContext(null)
export const useDeck = () => useContext(DeckContext)

// ---------- rozpoznawanie nazw plików ----------
const RANK_ALIASES = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9', '10': '10',
  J: 'J', Q: 'Q', K: 'K', A: 'A',
  JACK: 'J', QUEEN: 'Q', KING: 'K', ACE: 'A',
  WALET: 'J', DAMA: 'Q', KROL: 'K', AS: 'A',
}
const SUIT_ALIASES = {
  S: 'S', H: 'H', D: 'D', C: 'C',
  SPADES: 'S', HEARTS: 'H', DIAMONDS: 'D', CLUBS: 'C',
  PIK: 'S', KIER: 'H', KARO: 'D', TREFL: 'C',
  '\u2660': 'S', '\u2665': 'H', '\u2666': 'D', '\u2663': 'C',
}

function normalizeName(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
}

// "QS.svg" | "10_of_hearts.png" | "king diamonds.svg" | "AS KARO.svg" -> "QS" | "10H"...
// null = plik nie jest kartą (pomijamy bez błędu)
export function parseFaceKey(filename) {
  const base = normalizeName(String(filename).split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]+$/, '').trim())
  if (!base) return null
  if (/^JOKER/.test(base)) return 'JOKER' // joker, joker1, joker2...
  if (/^REW/.test(base)) return null // rewers - pomijamy (przody wgrywamy)
  // zbitka: QS / 10H / AC
  const flat = base.replace(/[\s_\-.]+/g, '')
  const m = flat.match(/^(\d{1,2}|[JQKA])([SHDC\u2660\u2665\u2666\u2663])$/)
  if (m) return m[1] + (SUIT_ALIASES[m[2]] || m[2])
  // słowa: "10 OF HEARTS", "Q S", "AS KARO"...
  const parts = base.replace(/[_\-.]+/g, ' ').split(/\s+/).filter(Boolean)
  let rank = null
  let suit = null
  for (const p of parts) {
    if (!rank && RANK_ALIASES[p]) rank = RANK_ALIASES[p]
    else if (!suit && SUIT_ALIASES[p]) suit = SUIT_ALIASES[p]
  }
  return rank && suit ? rank + suit : null
}

// ---------- limity (bezpiecznik przed zalaniem serwera) ----------
export const MAX_FILE_BYTES = 3e6 // 3 MB na pojedynczy plik karty
export const MAX_DECK_BYTES = 16e6 // 16 MB sumy dataURL-i w talii

function mimeOf(name) {
  const e = String(name).toLowerCase().split('.').pop()
  if (e === 'svg') return 'image/svg+xml'
  if (e === 'png') return 'image/png'
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  return null
}

function bytesToDataUrl(bytes, mime) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = () => rej(new Error('Nie udało się wczytać pliku obrazu'))
    r.readAsDataURL(new Blob([bytes], { type: mime }))
  })
}

// ---------- budowanie talii z listy plików ----------
// items: [{ name, blob } | { name, bytes }] - z folderu albo z ZIP-a
async function buildDeck(items, name) {
  const faces = {}
  let total = 0
  for (const it of items) {
    const key = parseFaceKey(it.name)
    const mime = mimeOf(it.name)
    if (!key || !mime || faces[key]) continue
    const bytes = it.bytes || (await it.blob.arrayBuffer())
    if (bytes.byteLength > MAX_FILE_BYTES) continue // zbyt ciężki plik - pomijamy
    const url = await bytesToDataUrl(bytes, mime)
    // base64 dorzuca ~33% - pilnujemy też długości gotowego dataURL-a
    if (url.length > MAX_FILE_BYTES * 1.4) continue
    faces[key] = url
    total += url.length
    if (total > MAX_DECK_BYTES) {
      throw new Error(`Talia jest za duża (max ${Math.round(MAX_DECK_BYTES / 1e6)} MB) - wybierz lżejsze pliki`)
    }
  }
  const count = Object.keys(faces).length
  if (!count) {
    throw new Error('Nie rozpoznano żadnej karty - nazwy plików typu QS.svg, 10H.png, AH.svg, joker.svg')
  }
  return {
    deck: { name: String(name || 'Talia').slice(0, 40), faces },
    missing: ALL_CARD_KEYS.filter((k) => !faces[k]),
  }
}

// folder wybrany pickerem (<input webkitdirectory>)
export async function readDeckFromFolder(fileList, name) {
  const items = []
  for (const f of Array.from(fileList || [])) {
    if (mimeOf(f.name)) items.push({ name: f.name, blob: f })
  }
  return buildDeck(items, name)
}

// ---------- ZIP bez zależności (central directory + deflate-raw) ----------
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ta przeglądarka nie umie czytać ZIP - wgraj zwykły folder kart')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(file) {
  const buf = await file.arrayBuffer()
  const dv = new DataView(buf)
  const dec = new TextDecoder()
  // End Of Central Directory - szukamy sygnatury od końca pliku
  let p = buf.byteLength - 22
  while (p >= 0 && dv.getUint32(p, true) !== 0x06054b50) p--
  if (p < 0) throw new Error('To nie jest poprawny plik ZIP')
  const count = dv.getUint16(p + 10, true)
  let off = dv.getUint32(p + 16, true)
  const out = []
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break // rekord centralny
    const method = dv.getUint16(off + 10, true)
    const compSize = dv.getUint32(off + 20, true)
    const nameLen = dv.getUint16(off + 28, true)
    const extraLen = dv.getUint16(off + 30, true)
    const cmtLen = dv.getUint16(off + 32, true)
    const lho = dv.getUint32(off + 42, true) // pozycja nagłówka lokalnego
    const name = dec.decode(new Uint8Array(buf, off + 46, nameLen))
    off += 46 + nameLen + extraLen + cmtLen
    if (name.endsWith('/') || name.endsWith('\\')) continue // katalog
    if (dv.getUint32(lho, true) !== 0x04034b50) continue
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true)
    let bytes = new Uint8Array(buf, start, compSize)
    if (method === 8) bytes = await inflateRaw(bytes)
    else if (method !== 0) continue // nieznana metoda kompresji - pomijamy
    out.push({ name, bytes })
  }
  return out
}

// plik .zip wybrany pickerem
export async function readDeckFromZip(file, name) {
  const entries = await unzip(file)
  const items = []
  for (const e of entries) {
    if (mimeOf(e.name)) items.push({ name: e.name, bytes: e.bytes })
  }
  return buildDeck(items, name)
}

// ---------- biblioteka talii (IndexedDB) ----------
const DB_NAME = 'blef-decks'
const STORE = 'decks'

function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('Przeglądarka nie wspiera IndexedDB'))
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'name' })
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

export const listDeckNames = () => withStore('readonly', (s) => s.getAllKeys()).catch(() => [])
export const getDeck = (name) => withStore('readonly', (s) => s.get(name)).catch(() => null)
export const saveDeck = (deck) => withStore('readwrite', (s) => s.put(deck))
export const removeDeck = (name) => withStore('readwrite', (s) => s.delete(name))

// ---------- pomocnicze do komunikatów ----------
// "2, 3, 4, 5, 6, 7, 8, joker" zamiast 29 kluczy "2S 2H 2D..."
export function missingLabel(missing) {
  const byRank = {}
  for (const k of missing || []) {
    const r = k === 'JOKER' ? 'joker' : k.slice(0, -1)
    byRank[r] = (byRank[r] || 0) + 1
  }
  return Object.entries(byRank)
    .map(([r, n]) => (n >= 4 ? r : `${r}×${n}`))
    .join(', ')
}
