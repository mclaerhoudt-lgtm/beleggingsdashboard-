import type {
  Transaction,
  AccountEvent,
  Position,
  ToekomstParams,
  ToekomstPunt,
  KoersCache,
} from '../types'
import { ISIN_SYMBOLS as ISIN_MAP } from '../types'

// Month-end reference prices keyed by ISIN → 'YYYY-MM'
export const HISTORISCHE_KOERSEN: Record<string, Record<string, number>> = {
  'IE00B3XXRP09': {
    '2024-07': 97.00,  '2024-08': 103.57, '2024-09': 105.68,
    '2024-10': 108.65, '2024-11': 111.65, '2024-12': 111.74,
    '2025-01': 111.44, '2025-02': 109.57, '2025-03': 106.20,
    '2025-04': 101.50, '2025-05': 104.30, '2025-06': 107.80,
    '2025-07': 103.80, '2025-08': 103.57, '2025-09': 105.68,
    '2025-10': 108.65, '2025-11': 111.65, '2025-12': 111.74,
    '2026-01': 111.44, '2026-02': 109.57, '2026-03': 109.57,
    '2026-04': 112.50, '2026-05': 123.69,
  },
  'NL0010273215': {
    '2024-07': 858.80,  '2024-08': 820.50,  '2024-09': 795.20,
    '2024-10': 745.00,  '2024-11': 680.50,  '2024-12': 710.20,
    '2025-01': 750.80,  '2025-02': 780.30,  '2025-03': 820.60,
    '2025-04': 780.20,  '2025-05': 810.50,  '2025-06': 850.20,
    '2025-07': 920.40,  '2025-08': 980.70,  '2025-09': 1050.20,
    '2025-10': 1100.50, '2025-11': 1180.30, '2025-12': 1220.60,
    '2026-01': 1260.40, '2026-02': 1280.20, '2026-03': 1280.20,
    '2026-04': 1300.20, '2026-05': 1411.00,
  },
}

// ─── types for Logboek ───────────────────────────────────────────────────────

export interface PositieMaandDetail {
  isin: string
  product: string
  aantalEindMaand: number
  koersBeginMaand: number
  koersEindMaand: number
  rendementEuro: number
  rendementPct: number
}

export interface MaandData {
  rendementEuro: number
  rendementPct: number
  waardeEindeMaand: number
  aankopen: Transaction[]
  hasPosities: boolean  // had open positions this month (including months without purchases)
  hadAankopen: boolean
  positieDetails: PositieMaandDetail[]
}

// ─── helpers ────────────────────────────────────────────────────────────────

function mkKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function prevKey(year: number, month: number): { y: number; m: number } {
  return month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 }
}

// Cumulative position snapshot at the last moment of `maxDate`
function positiesOpMoment(
  transactions: Transaction[],
  maxDate: Date,
): Record<string, { product: string; aantal: number }> {
  const acc: Record<string, { product: string; aantal: number }> = {}
  for (const t of transactions) {
    if (new Date(t.datum) > maxDate) continue
    if (!t.isin) continue
    if (!acc[t.isin]) acc[t.isin] = { product: t.product, aantal: 0 }
    acc[t.isin].aantal += t.aantal
  }
  return Object.fromEntries(Object.entries(acc).filter(([, e]) => e.aantal > 0.0001))
}

// Human-readable short names for known ISINs (display only)
export const KORTE_NAAM: Record<string, string> = {
  'IE00B3XXRP09': 'S&P500 ETF',
  'NL0010273215': 'ASML',
}

// ─── yearly per-position return ───────────────────────────────────────────────

export interface JaarPositieRendement {
  isin: string
  product: string
  aantalEindJaar: number
  koersBeginJaar: number  // January of that year (or earliest month in HISTORISCHE_KOERSEN)
  koersEindJaar: number   // December (completed year) or latest available (current year)
  rendementEuro: number
  rendementPct: number
}

export function calcJaarPositieRendementen(
  transactions: Transaction[],
  year: number,
): JaarPositieRendement[] {
  const now = new Date()
  const isCurrentYear = year === now.getFullYear()

  const eindDatum = isCurrentYear
    ? now
    : new Date(year, 11, 31, 23, 59, 59)

  const posities = positiesOpMoment(transactions, eindDatum)

  return Object.entries(posities)
    .map(([isin, { product, aantal }]) => {
      const priceMap = HISTORISCHE_KOERSEN[isin] ?? {}
      const allKeys  = Object.keys(priceMap).sort()
      const yearKeys = allKeys.filter(k => k.startsWith(`${year}-`))

      // Begin: January price, or first available month that year
      const koersBeginJaar = priceMap[`${year}-01`]
        ?? (yearKeys.length > 0 ? priceMap[yearKeys[0]] : 0)
        ?? 0

      // End: December (past year) or most-recent available (current year)
      let koersEindJaar: number
      if (!isCurrentYear) {
        koersEindJaar = priceMap[`${year}-12`]
          ?? (yearKeys.length > 0 ? priceMap[yearKeys[yearKeys.length - 1]] : 0)
          ?? 0
      } else {
        const curKey = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const valid  = allKeys.filter(k => k <= curKey)
        koersEindJaar = valid.length > 0 ? priceMap[valid[valid.length - 1]] ?? 0 : 0
      }

      if (!koersBeginJaar || !koersEindJaar) return null

      const rendementPct  = ((koersEindJaar - koersBeginJaar) / koersBeginJaar) * 100
      const rendementEuro = (koersEindJaar - koersBeginJaar) * aantal

      return { isin, product, aantalEindJaar: aantal, koersBeginJaar, koersEindJaar, rendementEuro, rendementPct }
    })
    .filter((r): r is JaarPositieRendement => r !== null)
}

// CAGR of the S&P500 ETF from the first to the last price in HISTORISCHE_KOERSEN.
// Used as a data-driven suggestion in the Toekomst calculator.
export function calcGemiddeldJaarRendement(): number | null {
  const priceMap = HISTORISCHE_KOERSEN['IE00B3XXRP09']
  if (!priceMap) return null

  const keys = Object.keys(priceMap).sort()
  if (keys.length < 3) return null  // need at least a quarter of data

  const firstKey   = keys[0]
  const lastKey    = keys[keys.length - 1]
  const firstPrice = priceMap[firstKey]
  const lastPrice  = priceMap[lastKey]
  if (!firstPrice || !lastPrice || firstPrice <= 0) return null

  const [fy, fm] = firstKey.split('-').map(Number)
  const [ly, lm] = lastKey.split('-').map(Number)
  const months = (ly - fy) * 12 + (lm - fm)
  if (months < 3) return null

  const cagr = (Math.pow(lastPrice / firstPrice, 12 / months) - 1) * 100
  return Math.round(cagr * 10) / 10  // one decimal
}

// ─── exports ─────────────────────────────────────────────────────────────────

// Timeline of monthly portfolio snapshots from first transaction to today.
// Used by Overzicht for GrowthChart + ReturnChart.
export interface PortfolioMaand {
  key: string           // YYYY-MM
  waarde: number        // end-of-month portfolio value (from HISTORISCHE_KOERSEN)
  ingelegd: number      // cumulative invested (sum |totaal| for buys)
  rendementEuro: number // (koers_eind − koers_begin) × aantal for all positions
  rendementPct: number  // rendementEuro / prevWaarde × 100
}

export function calcPortfolioHistorie(transactions: Transaction[]): PortfolioMaand[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.datum.localeCompare(b.datum))
  const firstDate = new Date(sorted[0].datum)
  const now = new Date()

  const months: PortfolioMaand[] = []
  let prevWaarde = 0
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)

  for (let safety = 0; cursor <= now && safety < 300; safety++) {
    const year  = cursor.getFullYear()
    const month = cursor.getMonth()
    const thisKey = mkKey(year, month)
    const { y: py, m: pm } = prevKey(year, month)
    const prevK = mkKey(py, pm)
    const eindDatum = new Date(year, month + 1, 0, 23, 59, 59)

    const pos = positiesOpMoment(transactions, eindDatum)

    let waarde = 0
    let rendementEuro = 0
    for (const [isin, { aantal }] of Object.entries(pos)) {
      const koersEind  = HISTORISCHE_KOERSEN[isin]?.[thisKey] ?? 0
      const koersBegin = HISTORISCHE_KOERSEN[isin]?.[prevK]   ?? 0
      waarde += aantal * koersEind
      if (koersEind > 0 && koersBegin > 0) rendementEuro += (koersEind - koersBegin) * aantal
    }

    const ingelegd = transactions
      .filter(t => t.aantal > 0 && new Date(t.datum) <= eindDatum)
      .reduce((s, t) => s + Math.abs(t.totaal), 0)

    const rendementPct = prevWaarde > 0 ? (rendementEuro / prevWaarde) * 100 : 0

    if (waarde > 0) {
      months.push({ key: thisKey, waarde, ingelegd, rendementEuro, rendementPct })
      prevWaarde = waarde
    }

    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months
}

export function calcMaandData(
  transactions: Transaction[],
  year: number,
): Record<number, MaandData> {
  const result: Record<number, MaandData> = {}

  for (let m = 0; m < 12; m++) {
    // Last instant of this month / last instant of previous month
    const eindDitMoment = new Date(year, m + 1, 0, 23, 59, 59)
    const { y: py, m: pm } = prevKey(year, m)
    const eindVorigMoment = new Date(py, pm + 1, 0, 23, 59, 59)

    const positiesEind  = positiesOpMoment(transactions, eindDitMoment)
    const positiesVorig = positiesOpMoment(transactions, eindVorigMoment)

    const hasPosities = Object.keys(positiesEind).length > 0
    const thisKey = mkKey(year, m)
    const prevK   = mkKey(py, pm)

    const aankopen = transactions.filter(t => {
      const d = new Date(t.datum)
      return d.getFullYear() === year && d.getMonth() === m && t.aantal > 0
    })

    let totalRendementEuro = 0
    let portfolioBeginWaarde = 0
    let portfolioEindWaarde = 0
    const positieDetails: PositieMaandDetail[] = []

    for (const [isin, { product, aantal }] of Object.entries(positiesEind)) {
      const koersEind  = HISTORISCHE_KOERSEN[isin]?.[thisKey] ?? 0
      const koersBegin = HISTORISCHE_KOERSEN[isin]?.[prevK]   ?? 0
      const aantalVorig = positiesVorig[isin]?.aantal ?? 0

      // Use the user-specified formula: (koers_eind - koers_begin) × aantal_eind
      const rendementEuro = koersEind > 0 && koersBegin > 0
        ? (koersEind - koersBegin) * aantal
        : 0
      const rendementPct = koersBegin > 0
        ? ((koersEind - koersBegin) / koersBegin) * 100
        : 0

      totalRendementEuro += rendementEuro
      portfolioBeginWaarde += aantalVorig * koersBegin
      portfolioEindWaarde  += aantal * koersEind

      positieDetails.push({
        isin,
        product,
        aantalEindMaand: aantal,
        koersBeginMaand: koersBegin,
        koersEindMaand: koersEind,
        rendementEuro,
        rendementPct,
      })
    }

    const rendementPct = portfolioBeginWaarde > 0
      ? (totalRendementEuro / portfolioBeginWaarde) * 100
      : 0

    result[m] = {
      rendementEuro: totalRendementEuro,
      rendementPct,
      waardeEindeMaand: portfolioEindWaarde,
      aankopen,
      hasPosities,
      hadAankopen: aankopen.length > 0,
      positieDetails,
    }
  }

  return result
}

// ─── positions (with GAK fix) ────────────────────────────────────────────────

export function calcPositions(
  transactions: Transaction[],
  accountEvents: AccountEvent[],
  koersen: KoersCache,
): Position[] {
  // Per ISIN: track koersKosten (= koers × aantal, no fees) separately from totalGekocht
  const byIsin: Record<string, {
    product: string
    koersKosten: number      // sum(koers × aantal) for buys — used for GAK
    totalGekocht: number     // total units bought
    currentAantal: number    // running holding = buys − sells
  }> = {}

  for (const t of transactions) {
    if (!t.isin) continue
    if (!byIsin[t.isin]) {
      byIsin[t.isin] = { product: t.product, koersKosten: 0, totalGekocht: 0, currentAantal: 0 }
    }
    const e = byIsin[t.isin]
    if (t.aantal > 0) {
      // Buy: accumulate execution price × units (transaction fees excluded)
      e.koersKosten   += t.koers * t.aantal
      e.totalGekocht  += t.aantal
      e.currentAantal += t.aantal
    } else {
      // Sell: only affects the running holding
      e.currentAantal += t.aantal  // aantal is negative for sells
    }
  }

  // Dividend per ISIN
  const dividendByIsin: Record<string, { bruto: number; belasting: number }> = {}
  for (const e of accountEvents) {
    if (e.type === 'dividend' || e.type === 'dividendbelasting') {
      if (!dividendByIsin[e.isin]) dividendByIsin[e.isin] = { bruto: 0, belasting: 0 }
      if (e.type === 'dividend') dividendByIsin[e.isin].bruto    += e.bedrag
      else                       dividendByIsin[e.isin].belasting += e.bedrag
    }
  }

  return Object.entries(byIsin)
    .filter(([, e]) => e.currentAantal > 0.0001)
    .map(([isin, entry]) => {
      // GAK = sum(koers × units_bought) / total_units_bought  — matches DEGIRO
      const gemAankoopprijs = entry.totalGekocht > 0
        ? entry.koersKosten / entry.totalGekocht
        : 0

      const symbol       = ISIN_MAP[isin]
      const koersData    = symbol ? koersen[symbol] : undefined
      const huidigeKoers = koersData?.price ?? 0
      const waarde       = entry.currentAantal * huidigeKoers
      const kostenbasis  = entry.currentAantal * gemAankoopprijs
      const rendementEuro = waarde - kostenbasis
      const rendementPct  = kostenbasis > 0 ? (rendementEuro / kostenbasis) * 100 : 0

      const div = dividendByIsin[isin]
      const nettoDividend = div ? div.bruto - div.belasting : 0
      const dividendrendementPct = kostenbasis > 0 ? (nettoDividend / kostenbasis) * 100 : 0

      return {
        isin,
        product: entry.product,
        aantal: entry.currentAantal,
        gemAankoopprijs,
        huidigeKoers,
        waarde,
        rendementEuro,
        rendementPct,
        nettoDividend,
        dividendrendementPct,
      }
    })
}

export function calcPortfolioValue(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + p.waarde, 0)
}

export function calcTotaalIngelegd(accountEvents: AccountEvent[]): number {
  return accountEvents
    .filter(e => e.type === 'storting')
    .reduce((sum, e) => sum + e.bedrag, 0)
}

export function calcBox3Oud(vermogen: number, hvv: number, forfait: number, tarief: number): number {
  const grondslag = Math.max(0, vermogen - hvv)
  return grondslag * (forfait / 100) * (tarief / 100)
}

export function calcBox3Nieuw(
  rendement: number,
  hvr: number,
  tarief: number,
  carryLossVorig: number,
): { belasting: number; carryLoss: number } {
  const gecorrigeerd = rendement - carryLossVorig
  const belastbaar   = Math.max(0, gecorrigeerd - hvr)
  const belasting    = belastbaar * (tarief / 100)
  const carryLoss    = gecorrigeerd < 0 ? Math.abs(gecorrigeerd) : 0
  return { belasting, carryLoss }
}

export function calcToekomst(params: ToekomstParams): ToekomstPunt[] {
  const { startkapitaal, inlegFase1, kostenFase1, looptijd, verhoogmomenten,
          rendementPct, inflatiePct,
          box3Mode, box3Tarief, hvv, hvr } = params

  const punten: ToekomstPunt[] = []
  let nominaal             = startkapitaal
  let naBox3               = startkapitaal
  let ingelegd             = 0
  let totaleKosten         = 0
  let cumulatieveBelasting = 0
  let carryLoss            = 0
  const r   = rendementPct / 100
  const inf = inflatiePct / 100

  for (let jaar = 1; jaar <= looptijd; jaar++) {
    const { netto, kosten } = getFaseInleg(jaar, inlegFase1, kostenFase1, verhoogmomenten)
    const jaarNetto  = netto  * 12
    const jaarKosten = kosten * 12

    nominaal = (nominaal + jaarNetto) * (1 + r)
    ingelegd     += jaarNetto
    totaleKosten += jaarKosten

    let jaarBelasting = 0
    if (box3Mode === 'oud') {
      jaarBelasting = calcBox3Oud(naBox3, hvv, 6, box3Tarief)
    } else if (box3Mode === 'nieuw') {
      const res = calcBox3Nieuw(naBox3 * r, hvr, box3Tarief, carryLoss)
      jaarBelasting = res.belasting
      carryLoss     = res.carryLoss
    }
    naBox3 = (naBox3 + jaarNetto) * (1 + r) - jaarBelasting
    cumulatieveBelasting += jaarBelasting

    const reeel = naBox3 / Math.pow(1 + inf, jaar)

    // Which fase are we in?
    const faseIndex = verhoogmomenten
      .filter(m => jaar >= m.jaar)
      .length

    punten.push({
      jaar,
      label:               `Jaar ${jaar}`,
      nominaal:            Math.max(0, nominaal),
      naBox3:              Math.max(0, naBox3),
      reeel:               Math.max(0, reeel),
      ingelegd,
      totaleKosten,
      jaarBelasting,
      cumulatieveBelasting,
      maandInleg:          netto,
      faseIndex,
    })
  }
  return punten
}

// Returns netto monthly inleg and monthly costs for a given year
export function getFaseInleg(
  jaar: number,
  basisBedrag: number,
  basisKosten: number,
  momenten: Array<{ jaar: number; bedrag: number; kosten: number }>,
): { netto: number; kosten: number; bruto: number } {
  let bedrag = basisBedrag
  let kosten = basisKosten
  for (const m of [...momenten].sort((a, b) => a.jaar - b.jaar)) {
    if (jaar >= m.jaar) { bedrag = m.bedrag; kosten = m.kosten }
  }
  return { netto: bedrag - kosten, kosten, bruto: bedrag }
}
