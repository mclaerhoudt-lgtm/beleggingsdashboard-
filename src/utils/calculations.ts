import type {
  Transaction,
  AccountEvent,
  ManualEntry,
  Position,
  ToekomstParams,
  ToekomstPunt,
  KoersCache,
} from '../types'
import { ISIN_SYMBOLS as ISIN_MAP } from '../types'

// ─── types for Logboek ───────────────────────────────────────────────────────

export interface PositieMaandDetail {
  isin: string
  product: string
  aantalBeginMaand: number
  aantalEindMaand: number
  koersBeginMaand: number
  koersEindMaand: number
  nettoInleg: number          // cash flow into this position this month (buys − sells, incl. fees)
  rendementEuro: number       // waarde_eind − waarde_begin − nettoInleg (koersrendement, TWR-basis)
  rendementPct: number | null // null wanneer waarde_begin = 0 (geen zinvolle basis, bv. instapmaand)
  isSchatting: boolean        // koers is carried-forward of een live tussentijdse koers, geen echte maand-eindkoers
}

export interface MaandData {
  rendementEuro: number
  rendementPct: number | null // null wanneer waardeBeginMaand = 0 (geen zinvolle basis)
  nettoInleg: number          // cash flow in/uit posities deze maand (buys − sells)
  waardeBeginMaand: number
  waardeEindeMaand: number
  aankopen: Transaction[]
  verkopen: Transaction[]
  hasPosities: boolean  // had open positions this month (including months without purchases)
  hadAankopen: boolean
  isSchatting: boolean   // lopende maand en/of carried-forward koers gebruikt voor minstens 1 positie
  positieDetails: PositieMaandDetail[]
}

// ─── helpers ────────────────────────────────────────────────────────────────

function mkKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

function prevKey(year: number, month: number): { y: number; m: number } {
  return month === 0 ? { y: year - 1, m: 11 } : { y: year, m: month - 1 }
}

// Looks up the close price for `key` ('YYYY-MM'). If that exact month is
// missing from koersHistorie, carries forward the most recent earlier month
// so a data gap never silently produces a 0 or a skipped month.
function resolveKoers(
  priceMap: Record<string, number> | undefined,
  key: string,
): { koers: number; isSchatting: boolean } {
  if (!priceMap) return { koers: 0, isSchatting: true }
  if (priceMap[key] != null) return { koers: priceMap[key], isSchatting: false }
  const eerdereKeys = Object.keys(priceMap).filter(k => k <= key).sort()
  if (eerdereKeys.length > 0) {
    return { koers: priceMap[eerdereKeys[eerdereKeys.length - 1]], isSchatting: true }
  }
  return { koers: 0, isSchatting: true }
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

// ─── exports ─────────────────────────────────────────────────────────────────

// Timeline of monthly portfolio snapshots from first transaction to today.
// Used by Overzicht for GrowthChart + ReturnChart.
export interface PortfolioMaand {
  key: string           // YYYY-MM
  waarde: number        // end-of-month portfolio value (current month: live price approximation)
  ingelegd: number      // cumulative invested (sum |totaal| for buys)
  rendementEuro: number // waarde_eind − waarde_begin − nettoInleg_deze_maand (koersrendement)
  rendementPct: number | null // rendementEuro / prevWaarde × 100; null zonder basis of zonder betrouwbare lopende-maandkoers
  isSchatting: boolean  // lopende maand en/of carried-forward koers gebruikt
}

export function calcPortfolioHistorie(
  transactions: Transaction[],
  koersHistorie: Record<string, Record<string, number>>,
  koersen: KoersCache,
): PortfolioMaand[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.datum.localeCompare(b.datum))
  const firstDate = new Date(sorted[0].datum)
  const now = new Date()
  const huidigeMaandKey = mkKey(now.getFullYear(), now.getMonth())

  const months: PortfolioMaand[] = []
  let prevWaarde = 0
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)

  for (let safety = 0; cursor <= now && safety < 600; safety++) {
    const year  = cursor.getFullYear()
    const month = cursor.getMonth()
    const thisKey = mkKey(year, month)
    const isHuidigeMaand = thisKey === huidigeMaandKey
    const eindDatum = isHuidigeMaand ? now : new Date(year, month + 1, 0, 23, 59, 59)
    const beginDatum = new Date(year, month, 1, 0, 0, 0)

    const pos = positiesOpMoment(transactions, eindDatum)

    let waarde = 0
    let isSchatting = false
    // Zoals in berekenMaandData: als de live koers voor de lopende maand niet
    // beschikbaar is, valt koers terug op de laatst bekende maand-eindkoers —
    // gelijk aan de vorige maand, dus geen echte meting. Dan geen percentage tonen.
    let huidigeMaandOnbetrouwbaar = false
    for (const [isin, { aantal }] of Object.entries(pos)) {
      const priceMap = koersHistorie[isin]
      let koers: number

      if (isHuidigeMaand) {
        const symbol = ISIN_MAP[isin]
        const live = symbol ? koersen[symbol]?.price : undefined
        if (live && live > 0) {
          koers = live
        } else {
          koers = resolveKoers(priceMap, thisKey).koers
          huidigeMaandOnbetrouwbaar = true
        }
        isSchatting = true // lopende maand — nooit een echte maand-eindkoers
      } else {
        const r = resolveKoers(priceMap, thisKey)
        koers = r.koers
        if (r.isSchatting) isSchatting = true
      }

      waarde += aantal * koers
    }

    const ingelegd = transactions
      .filter(t => t.aantal > 0 && new Date(t.datum) <= eindDatum)
      .reduce((s, t) => s + Math.abs(t.totaal), 0)

    const nettoInlegMaand = -transactions
      .filter(t => { const d = new Date(t.datum); return d >= beginDatum && d <= eindDatum })
      .reduce((s, t) => s + t.totaal, 0)

    const rendementEuro = waarde - prevWaarde - nettoInlegMaand
    const rendementPct  = (prevWaarde > 0 && !huidigeMaandOnbetrouwbaar) ? (rendementEuro / prevWaarde) * 100 : (prevWaarde > 0 ? null : 0)

    if (waarde > 0) {
      months.push({ key: thisKey, waarde, ingelegd, rendementEuro, rendementPct, isSchatting })
      prevWaarde = waarde
    }

    cursor.setMonth(cursor.getMonth() + 1)
  }

  return months
}

// Time-weighted-return-style monthly breakdown: isolates koersrendement from
// stortingen/aankopen door de cashflow van de maand af te trekken vóór het % te bepalen.
//   rendementEuro = waarde_eind − waarde_begin − nettoInleg
//   rendementPct  = rendementEuro / waarde_begin × 100   (null als waarde_begin = 0)
function berekenMaandData(
  transactions: Transaction[],
  year: number,
  m: number,
  koersHistorie: Record<string, Record<string, number>>,
  koersen: KoersCache,
): MaandData {
  const now = new Date()
  const thisKey = mkKey(year, m)
  const huidigeMaandKey = mkKey(now.getFullYear(), now.getMonth())
  const isHuidigeMaand = thisKey === huidigeMaandKey

  // Toekomstige maand — nog niet gebeurd, ongeacht welke posities er "op dat moment" al zouden bestaan
  if (new Date(year, m, 1) > now) {
    return {
      rendementEuro: 0, rendementPct: null, nettoInleg: 0,
      waardeBeginMaand: 0, waardeEindeMaand: 0,
      aankopen: [], verkopen: [],
      hasPosities: false, hadAankopen: false, isSchatting: false,
      positieDetails: [],
    }
  }

  // Last instant of this month (or "now" if still ongoing) / last instant of previous month
  const eindDitMoment = isHuidigeMaand ? now : new Date(year, m + 1, 0, 23, 59, 59)
  const { y: py, m: pm } = prevKey(year, m)
  const eindVorigMoment = new Date(py, pm + 1, 0, 23, 59, 59)
  const beginDitMoment  = new Date(year, m, 1, 0, 0, 0)
  const prevK = mkKey(py, pm)

  const positiesEind  = positiesOpMoment(transactions, eindDitMoment)
  const positiesVorig = positiesOpMoment(transactions, eindVorigMoment)
  const hasPosities = Object.keys(positiesEind).length > 0

  const aankopen = transactions.filter(t => {
    const d = new Date(t.datum)
    return d.getFullYear() === year && d.getMonth() === m && t.aantal > 0
  })
  const verkopen = transactions.filter(t => {
    const d = new Date(t.datum)
    return d.getFullYear() === year && d.getMonth() === m && t.aantal < 0
  })
  const maandTransacties = transactions.filter(t => {
    const d = new Date(t.datum)
    return d >= beginDitMoment && d <= eindDitMoment
  })
  const nettoInlegMaand = -maandTransacties.reduce((s, t) => s + t.totaal, 0)

  let totalRendementEuro = 0
  let portfolioBeginWaarde = 0
  let portfolioEindWaarde = 0
  let isSchatting = false
  // Waar voor de lopende maand geen live koers beschikbaar was: dan valt eindKoers
  // terug op de laatst bekende (carried-forward) maand-eindkoers, gelijk aan de
  // beginkoers — dat geeft een schijnbaar "+0,00%" i.p.v. een echte meting. Zo'n
  // maand mag geen percentage tonen (zie rendementPct hieronder).
  let huidigeMaandOnbetrouwbaar = false
  const positieDetails: PositieMaandDetail[] = []

  // Union: posities aan begin ÉN eind van de maand (dekt ook volledige verkopen binnen de maand)
  const isins = new Set([...Object.keys(positiesEind), ...Object.keys(positiesVorig)])

  for (const isin of isins) {
    const eindInfo  = positiesEind[isin]
    const vorigInfo = positiesVorig[isin]
    const product = eindInfo?.product ?? vorigInfo?.product ?? ''
    const aantalEind  = eindInfo?.aantal ?? 0
    const aantalBegin = vorigInfo?.aantal ?? 0

    const priceMap = koersHistorie[isin]
    const beginRes = resolveKoers(priceMap, prevK)

    let eindKoers: number
    let eindIsSchatting: boolean
    let eindLiveMislukt = false
    if (isHuidigeMaand) {
      const symbol = ISIN_MAP[isin]
      const live = symbol ? koersen[symbol]?.price : undefined
      if (live && live > 0) {
        eindKoers = live
      } else {
        eindKoers = resolveKoers(priceMap, thisKey).koers
        eindLiveMislukt = true
      }
      eindIsSchatting = true // lopende maand — geen echte maand-eindkoers
    } else {
      const r = resolveKoers(priceMap, thisKey)
      eindKoers = r.koers
      eindIsSchatting = r.isSchatting
    }

    const schat = beginRes.isSchatting || eindIsSchatting
    if (schat) isSchatting = true
    if (eindLiveMislukt) huidigeMaandOnbetrouwbaar = true

    const waardeBegin = aantalBegin * beginRes.koers
    const waardeEind  = aantalEind * eindKoers

    const positieNettoInleg = -maandTransacties
      .filter(t => t.isin === isin)
      .reduce((s, t) => s + t.totaal, 0)

    const rendementEuro = waardeEind - waardeBegin - positieNettoInleg
    const rendementPct  = (waardeBegin > 0 && !eindLiveMislukt) ? (rendementEuro / waardeBegin) * 100 : null

    totalRendementEuro += rendementEuro
    portfolioBeginWaarde += waardeBegin
    portfolioEindWaarde  += waardeEind

    positieDetails.push({
      isin,
      product,
      aantalBeginMaand: aantalBegin,
      aantalEindMaand: aantalEind,
      koersBeginMaand: beginRes.koers,
      koersEindMaand: eindKoers,
      nettoInleg: positieNettoInleg,
      rendementEuro,
      rendementPct,
      isSchatting: schat,
    })
  }

  const rendementPct = (portfolioBeginWaarde > 0 && !huidigeMaandOnbetrouwbaar)
    ? (totalRendementEuro / portfolioBeginWaarde) * 100
    : null

  return {
    rendementEuro: totalRendementEuro,
    rendementPct,
    nettoInleg: nettoInlegMaand,
    waardeBeginMaand: portfolioBeginWaarde,
    waardeEindeMaand: portfolioEindWaarde,
    aankopen,
    verkopen,
    hasPosities,
    hadAankopen: aankopen.length > 0,
    isSchatting,
    positieDetails,
  }
}

// Alle 12 maanden van één kalenderjaar — gebruikt door het Logboek voor de maandtegels.
export function calcMaandData(
  transactions: Transaction[],
  year: number,
  koersHistorie: Record<string, Record<string, number>>,
  koersen: KoersCache,
): Record<number, MaandData> {
  const result: Record<number, MaandData> = {}
  for (let m = 0; m < 12; m++) {
    result[m] = berekenMaandData(transactions, year, m, koersHistorie, koersen)
  }
  return result
}

export interface MaandDataPunt {
  year: number
  month: number  // 0-11
  data: MaandData
}

// Chronologische reeks van elke maand vanaf de eerste transactie t/m nu — de basis voor
// het all-time Logboek-overzicht. Herbruikt dezelfde per-maand berekening als calcMaandData,
// dus een enkel jaar (via naarMaandPunten) en all-time gebruiken exact dezelfde rekenmethode.
export function calcAlleMaandenData(
  transactions: Transaction[],
  koersHistorie: Record<string, Record<string, number>>,
  koersen: KoersCache,
): MaandDataPunt[] {
  if (transactions.length === 0) return []

  const sorted = [...transactions].sort((a, b) => a.datum.localeCompare(b.datum))
  const firstDate = new Date(sorted[0].datum)
  const now = new Date()

  const punten: MaandDataPunt[] = []
  const cursor = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)

  for (let safety = 0; cursor <= now && safety < 1200; safety++) {
    const year  = cursor.getFullYear()
    const month = cursor.getMonth()
    punten.push({ year, month, data: berekenMaandData(transactions, year, month, koersHistorie, koersen) })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return punten
}

// Zet het resultaat van calcMaandData (Record<0-11, MaandData> voor één jaar) om naar
// dezelfde MaandDataPunt[]-vorm als calcAlleMaandenData, zodat één set periode-functies
// zowel een los jaar als all-time kan verwerken.
export function naarMaandPunten(maandData: Record<number, MaandData>, year: number): MaandDataPunt[] {
  return Array.from({ length: 12 }, (_, m) => ({ year, month: m, data: maandData[m] }))
}

// ─── period aggregation (chained TWR) ─────────────────────────────────────────
// Werkt op een chronologische MaandDataPunt[] — dezelfde functies bedienen zowel een
// los jaar (12 punten, via naarMaandPunten) als all-time (alle maanden sinds de start).

function actieveMaandenGesorteerd(punten: MaandDataPunt[]): MaandDataPunt[] {
  return punten
    .filter(p => p.data.hasPosities)
    .sort((a, b) => a.year - b.year || a.month - b.month)
}

export interface MaandLabel {
  year: number
  month: number
  pct: number
}

export interface PeriodeRendementResultaat {
  rendementPct: number | null // geketende TWR: (1+r1)(1+r2)…(1+rn) − 1; null zonder geldige maand
  rendementEuro: number       // som van maand-€'s — consistent met rendementPct per constructie
  nettoInleg: number          // netto cashflow (aankopen − verkopen) in de periode
  totaalKosten: number        // transactiekosten (aankopen + verkopen) in de periode
  beginWaarde: number
  eindWaarde: number
  besteMaand: MaandLabel | null
  slechtsteMaand: MaandLabel | null
}

export function calcPeriodeRendement(punten: MaandDataPunt[]): PeriodeRendementResultaat | null {
  const actief = actieveMaandenGesorteerd(punten)
  if (actief.length === 0) return null

  let ketting = 1
  let heeftGeldigePct = false
  for (const p of actief) {
    if (p.data.rendementPct != null) {
      ketting *= (1 + p.data.rendementPct / 100)
      heeftGeldigePct = true
    }
  }
  const rendementPct = heeftGeldigePct ? (ketting - 1) * 100 : null

  const rendementEuro = actief.reduce((s, p) => s + p.data.rendementEuro, 0)
  const nettoInleg    = actief.reduce((s, p) => s + p.data.nettoInleg, 0)
  const totaalKosten  = actief.reduce(
    (s, p) => s + [...p.data.aankopen, ...p.data.verkopen].reduce((a, t) => a + t.transactiekosten, 0),
    0,
  )

  const beginWaarde = actief[0].data.waardeBeginMaand
  const eindWaarde  = actief[actief.length - 1].data.waardeEindeMaand

  let besteMaand: MaandLabel | null = null
  let slechtsteMaand: MaandLabel | null = null
  for (const p of actief) {
    if (p.data.rendementPct == null) continue
    if (!besteMaand || p.data.rendementPct > besteMaand.pct) besteMaand = { year: p.year, month: p.month, pct: p.data.rendementPct }
    if (!slechtsteMaand || p.data.rendementPct < slechtsteMaand.pct) slechtsteMaand = { year: p.year, month: p.month, pct: p.data.rendementPct }
  }

  // Sanity checks (altijd actief, console.assert is een no-op behalve loggen bij falen):
  // 1) €-identiteit: eindwaarde − beginwaarde moet gelijk zijn aan koersrendement + netto inleg.
  const identiteitAfwijking = Math.abs((eindWaarde - beginWaarde) - (rendementEuro + nettoInleg))
  console.assert(identiteitAfwijking < 0.01, '[calcPeriodeRendement] €-identiteit klopt niet', {
    eindWaarde, beginWaarde, rendementEuro, nettoInleg,
  })
  // 2) Zonder cashflow moet de geketende TWR overeenkomen met de eindpunt-ratio.
  if (rendementPct != null && Math.abs(nettoInleg) < 0.01 && beginWaarde > 0) {
    const eindpuntRatio = ((eindWaarde - beginWaarde) / beginWaarde) * 100
    console.assert(Math.abs(rendementPct - eindpuntRatio) < 0.5, '[calcPeriodeRendement] TWR wijkt af van eindpunt-ratio', {
      rendementPct, eindpuntRatio,
    })
  }

  return { rendementPct, rendementEuro, nettoInleg, totaalKosten, beginWaarde, eindWaarde, besteMaand, slechtsteMaand }
}

export interface CumulatieveTwrPunt {
  year: number
  month: number
  cumPct: number  // geketende TWR t/m en met deze maand
}

// Running (chained) TWR per active month — used for the opbouw-lijn in het Logboek.
export function calcCumulatieveTwr(punten: MaandDataPunt[]): CumulatieveTwrPunt[] {
  const actief = actieveMaandenGesorteerd(punten)

  let ketting = 1
  const result: CumulatieveTwrPunt[] = []
  for (const p of actief) {
    if (p.data.rendementPct != null) ketting *= (1 + p.data.rendementPct / 100)
    result.push({ year: p.year, month: p.month, cumPct: (ketting - 1) * 100 })
  }
  return result
}

// ─── per-position return over a period (contributie-gecorrigeerd, sluit aan bij het totaal) ──

export interface JaarPositieRendement {
  isin: string
  product: string
  aantalEindJaar: number
  koersBeginJaar: number       // koers bij begin van de eerste actieve maand van deze positie in de periode
  koersEindJaar: number        // koers bij eind van de laatste actieve maand van deze positie in de periode
  nettoInlegJaar: number       // netto inleg in déze positie in de periode (aankopen − verkopen)
  rendementEuro: number        // som van maandelijkse (eind − begin − nettoInleg) — Σ over posities = periodetotaal
  rendementPct: number | null  // geketende maandelijkse TWR voor déze positie; null zonder geldige maand
}

// Bouwt de per-positie cijfers op uit dezelfde maandelijkse positieDetails die ook het
// periodetotaal vormen (calcPeriodeRendement) — daardoor tellen de € per positie per
// constructie op tot het totale koersrendement, en "v/d totaal" tot 100%.
export function calcPositieRendementen(punten: MaandDataPunt[]): JaarPositieRendement[] {
  const actief = actieveMaandenGesorteerd(punten)

  interface Acc {
    product: string
    koersBeginJaar: number
    koersEindJaar: number
    aantalEindJaar: number
    nettoInlegJaar: number
    rendementEuro: number
    ketting: number
    heeftGeldigePct: boolean
  }
  const perIsin: Record<string, Acc> = {}

  for (const p of actief) {
    for (const pos of p.data.positieDetails) {
      if (!perIsin[pos.isin]) {
        perIsin[pos.isin] = {
          product: pos.product,
          koersBeginJaar: pos.koersBeginMaand,
          koersEindJaar: pos.koersEindMaand,
          aantalEindJaar: pos.aantalEindMaand,
          nettoInlegJaar: 0,
          rendementEuro: 0,
          ketting: 1,
          heeftGeldigePct: false,
        }
      }
      const e = perIsin[pos.isin]
      e.koersEindJaar   = pos.koersEindMaand   // laatst gepasseerde maand wint
      e.aantalEindJaar  = pos.aantalEindMaand
      e.nettoInlegJaar += pos.nettoInleg
      e.rendementEuro  += pos.rendementEuro
      if (pos.rendementPct != null) {
        e.ketting *= (1 + pos.rendementPct / 100)
        e.heeftGeldigePct = true
      }
    }
  }

  return Object.entries(perIsin)
    .map(([isin, e]) => ({
      isin,
      product: e.product,
      aantalEindJaar: e.aantalEindJaar,
      koersBeginJaar: e.koersBeginJaar,
      koersEindJaar: e.koersEindJaar,
      nettoInlegJaar: e.nettoInlegJaar,
      rendementEuro: e.rendementEuro,
      rendementPct: e.heeftGeldigePct ? (e.ketting - 1) * 100 : null,
    }))
    .sort((a, b) => b.rendementEuro - a.rendementEuro)
}

export interface PeriodeOverzicht {
  rendement: PeriodeRendementResultaat
  posities: JaarPositieRendement[]
}

// Bundelt periodetotaal + per-positie-uitsplitsing en bewaakt met een dev-check dat ze
// aansluiten: Σ per-positie-€ moet gelijk zijn aan het totale koersrendement, en Σ "v/d
// totaal" aan 100%. Werkt zowel voor een los jaar als voor all-time (zelfde punten-array).
export function calcPeriodeOverzicht(punten: MaandDataPunt[]): PeriodeOverzicht | null {
  const rendement = calcPeriodeRendement(punten)
  if (!rendement) return null
  const posities = calcPositieRendementen(punten)

  const somPositieEuro = posities.reduce((s, p) => s + p.rendementEuro, 0)
  console.assert(
    Math.abs(somPositieEuro - rendement.rendementEuro) < 0.01,
    '[calcPeriodeOverzicht] Σ per-positie-€ ≠ totaal koersrendement-€',
    { somPositieEuro, totaal: rendement.rendementEuro },
  )

  if (rendement.rendementEuro !== 0) {
    const somBijdragePct = posities.reduce((s, p) => s + (p.rendementEuro / rendement.rendementEuro) * 100, 0)
    console.assert(
      Math.abs(somBijdragePct - 100) < 0.1,
      '[calcPeriodeOverzicht] Σ "v/d totaal" ≠ 100%',
      { somBijdragePct },
    )
  }

  return { rendement, posities }
}

// TWR-benchmark van één ISIN (bv. VUSA) over exact dezelfde actieve maanden als de
// portefeuille in deze periode — geketend, koers-only, zodat het een eerlijke vergelijking
// is (geen appels-met-peren door een langere of kortere periode dan de portefeuille zelf).
export function calcBenchmarkRendement(
  koersHistorie: Record<string, Record<string, number>>,
  isin: string,
  punten: MaandDataPunt[],
): number | null {
  const priceMap = koersHistorie[isin]
  if (!priceMap) return null

  const actief = actieveMaandenGesorteerd(punten)
  if (actief.length === 0) return null

  let ketting = 1
  let heeftGeldigeMaand = false
  for (const p of actief) {
    const { y: py, m: pm } = prevKey(p.year, p.month)
    const begin = resolveKoers(priceMap, mkKey(py, pm)).koers
    const eind  = resolveKoers(priceMap, mkKey(p.year, p.month)).koers
    if (begin > 0 && eind > 0) {
      ketting *= (eind / begin)
      heeftGeldigeMaand = true
    }
  }
  return heeftGeldigeMaand ? (ketting - 1) * 100 : null
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

// Year of the earliest transaction or manual entry — used as the anchor point
// for "reëel (na inflatie)" so we don't deflate over years the user wasn't invested yet.
export function calcEersteJaar(transactions: Transaction[], manualEntries: ManualEntry[] = []): number {
  const jaren: number[] = [
    ...transactions.map(t => new Date(t.datum).getFullYear()),
    ...manualEntries.map(m => new Date(m.datum).getFullYear()),
  ]
  return jaren.length > 0 ? Math.min(...jaren) : new Date().getFullYear()
}

// Deflate a value by settings.inflatie, anchored at `eersteJaar` rather than a fixed year.
export function calcReeel(waarde: number, inflatiePct: number, jaar: number, eersteJaar: number): number {
  const jarenBelegd = Math.max(0, jaar - eersteJaar)
  return waarde / Math.pow(1 + inflatiePct / 100, jarenBelegd)
}

// Meest recente datum die daadwerkelijk in de geïmporteerde CSV-data voorkomt
// (Transactions.csv / Account.csv) — laat zien tot wanneer de import "bijgewerkt" is,
// los van wanneer de gebruiker de import zelf heeft uitgevoerd.
export function calcLaatsteDatum(transactions: Transaction[], accountEvents: AccountEvent[]): Date | null {
  let laatste: number | null = null
  for (const t of transactions) {
    const ms = new Date(t.datum).getTime()
    if (laatste === null || ms > laatste) laatste = ms
  }
  for (const e of accountEvents) {
    const ms = new Date(e.datum).getTime()
    if (laatste === null || ms > laatste) laatste = ms
  }
  return laatste === null ? null : new Date(laatste)
}

export function calcTotaalIngelegd(accountEvents: AccountEvent[]): number {
  return accountEvents.reduce((sum, e) => {
    if (e.type === 'storting') return sum + e.bedrag
    if (e.type === 'opname') return sum - e.bedrag
    return sum
  }, 0)
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
