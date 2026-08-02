export interface Transaction {
  id: string
  datum: string // ISO string
  product: string
  isin: string
  aantal: number
  koers: number
  transactiekosten: number
  totaal: number
  orderId: string
}

export interface AccountEvent {
  id: string
  datum: string
  type: 'storting' | 'opname' | 'dividend' | 'dividendbelasting'
  product: string
  isin: string
  bedrag: number
  omschrijving: string
}

export interface ManualEntry {
  id: string
  datum: string
  portefeuillewaarde: number
  totaalIngelegd: number
  periode: string
  notitie: string
}

export interface Position {
  isin: string
  product: string
  aantal: number
  gemAankoopprijs: number
  huidigeKoers: number
  waarde: number
  rendementEuro: number
  rendementPct: number
  nettoDividend: number
  dividendrendementPct: number
}

export interface KoersData {
  symbol: string
  price: number
  change: number
  changePercent: number
  currency: string
  updatedAt: string
}

export interface KoersCache {
  [symbol: string]: KoersData
}

// Monthly close prices per ISIN: ISIN -> 'YYYY-MM' -> close price.
// Sourced from Yahoo Finance monthly candles (see useHistorischeKoersen), cached in localStorage.
export interface KoersHistorie {
  [isin: string]: Record<string, number>
}

export interface Settings {
  inflatie: number
  transactiekosten: number
  box3Mode: 'geen' | 'oud' | 'nieuw'
  box3Tarief: number
  hvv: number
  hvr: number
}

export interface VerhoogMoment {
  jaar: number
  bedrag: number   // bruto maandelijkse inleg
  kosten: number   // transactiekosten per maand voor deze fase
}

export interface ToekomstParams {
  startkapitaal: number
  inlegFase1: number   // bruto maandelijks fase 1
  kostenFase1: number  // transactiekosten/mnd fase 1
  looptijd: number
  verhoogmomenten: VerhoogMoment[]
  rendementPct: number
  inflatiePct: number
  box3Mode: 'geen' | 'oud' | 'nieuw'
  box3Tarief: number
  hvv: number
  hvr: number
}

export interface ToekomstPunt {
  jaar: number
  label: string
  nominaal: number
  naBox3: number
  reeel: number              // naBox3 deflated by inflation (tax-aware)
  ingelegd: number           // cumulative netto inleg
  totaleKosten: number       // cumulative transactiekosten
  jaarBelasting: number      // tax paid this specific year
  cumulatieveBelasting: number
  maandInleg: number         // netto monthly inleg this year
  faseIndex: number          // 0 = fase 1, 1 = fase 2, …
}

export const ISIN_SYMBOLS: Record<string, string> = {
  'IE00B3XXRP09': 'VUSA.AS',
  'NL0010273215': 'ASML.AS',
}

export const DEFAULT_SETTINGS: Settings = {
  inflatie: 2.5,
  transactiekosten: 0,
  box3Mode: 'geen',
  box3Tarief: 36,
  hvv: 59357,
  hvr: 1800,
}
