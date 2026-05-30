import Papa from 'papaparse'
import { parseDegiroAmount } from './formatters'
import type { Transaction, AccountEvent } from '../types'

// DD-MM-YYYY + HH:MM → ISO string
function parseDegiroDate(dateStr: string, timeStr?: string): string {
  const parts = dateStr.trim().split('-')
  if (parts.length !== 3) return new Date().toISOString()
  const [d, m, y] = parts
  const t = timeStr?.trim() || '00:00'
  return new Date(`${y}-${m}-${d}T${t}:00`).toISOString()
}

// ─────────────────────────────────────────────────────────────
// Transactions.csv
//
// Exact column layout (header vs. data row are off by 1 for Order ID):
//  0  Datum
//  1  Tijd
//  2  Product
//  3  ISIN
//  4  Beurs
//  5  Uitvoeringsplaats
//  6  Aantal
//  7  Koers               ← quoted decimal e.g. "120,4380"
//  8  (valuta)
//  9  Lokale waarde
// 10  (valuta)
// 11  Waarde EUR
// 12  Wisselkoers
// 13  AutoFX Kosten
// 14  Transactiekosten    ← quoted e.g. "-3,00"
// 15  Totaal EUR          ← quoted e.g. "-123,44"
// 16  Order ID header → EMPTY in data (DEGIRO quirk)
// 17  (empty header)  → UUID in data  ← actual order ID
// ─────────────────────────────────────────────────────────────
export function parseTransactionsCsv(
  csvText: string,
  existing: Transaction[],
): { transactions: Transaction[]; added: number; skipped: number } {
  const existingIds = new Set(existing.map(t => t.orderId))

  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
    quoteChar: '"',
    delimiter: ',',
  })

  const rows = result.data
  if (rows.length < 2) return { transactions: existing, added: 0, skipped: 0 }

  // Debug: log header row and first data row so column mapping is visible
  console.log('[Transactions.csv] header :', rows[0])
  console.log('[Transactions.csv] row[1]  :', rows[1])
  console.log('[Transactions.csv] row count:', rows.length, '  col count:', rows[0]?.length)

  const newTransactions: Transaction[] = [...existing]
  let added = 0
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 15) continue   // need at least up to Totaal EUR

    const datumStr = row[0]?.trim()
    const tijdStr  = row[1]?.trim()
    const product  = row[2]?.trim() ?? ''
    const isin     = row[3]?.trim() ?? ''
    const aantalStr          = row[6]?.trim()
    const koersStr           = row[7]?.trim()
    const transactiekostenStr = row[14]?.trim()
    const totaalStr          = row[15]?.trim()

    // DEGIRO quirk: UUID sits at index 17, "Order ID" column (16) is empty
    const orderId = row[17]?.trim() || row[16]?.trim() || ''

    if (!datumStr || !isin) continue
    if (!orderId) { skipped++; continue }
    if (existingIds.has(orderId)) { skipped++; continue }

    const transaction: Transaction = {
      id: orderId,
      datum: parseDegiroDate(datumStr, tijdStr),
      product,
      isin,
      aantal: parseDegiroAmount(aantalStr),
      koers: parseDegiroAmount(koersStr),
      transactiekosten: Math.abs(parseDegiroAmount(transactiekostenStr)),
      totaal: parseDegiroAmount(totaalStr),
      orderId,
    }

    existingIds.add(orderId)
    newTransactions.push(transaction)
    added++
  }

  return { transactions: newTransactions, added, skipped }
}

// ─────────────────────────────────────────────────────────────
// Account.csv
//
//  0  Datum
//  1  Tijd
//  2  Valutadatum
//  3  Product
//  4  ISIN
//  5  Omschrijving
//  6  FX
//  7  Mutatie (valuta header, e.g. "EUR")
//  8  (empty header) = mutatie bedrag ← quoted e.g. "2,70" / "-0,41"
//  9  Saldo (valuta header, e.g. "EUR")
// 10  (empty header) = saldo bedrag
// 11  Order Id
// ─────────────────────────────────────────────────────────────
export function parseAccountCsv(
  csvText: string,
  existing: AccountEvent[],
): { events: AccountEvent[]; stortingen: number; dividenden: number; skipped: number } {
  const existingIds = new Set(existing.map(e => e.id))

  const result = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: true,
    quoteChar: '"',
    delimiter: ',',
  })

  const rows = result.data
  if (rows.length < 2) return { events: existing, stortingen: 0, dividenden: 0, skipped: 0 }

  console.log('[Account.csv] header :', rows[0])
  console.log('[Account.csv] row[1]  :', rows[1])
  console.log('[Account.csv] row count:', rows.length, '  col count:', rows[0]?.length)

  const newEvents: AccountEvent[] = [...existing]
  let stortingen = 0
  let dividenden = 0
  let skipped = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 6) continue

    const datumStr    = row[0]?.trim() ?? ''
    const tijdStr     = row[1]?.trim() ?? ''
    const product     = row[3]?.trim() ?? ''
    const isin        = row[4]?.trim() ?? ''
    const omschrijving = row[5]?.trim() ?? ''
    // mutatie bedrag is at index 8 (the unlabelled column after "Mutatie" valuta)
    const bedragStr   = row[8]?.trim() ?? ''

    if (!datumStr) continue

    const omschrijvingLower = omschrijving.toLowerCase()

    // Skip noise rows
    if (
      omschrijvingLower.includes('degiro transactiekosten') ||
      omschrijvingLower.startsWith('koop') ||
      omschrijvingLower.startsWith('verkoop') ||
      omschrijvingLower.includes('cash sweep') ||
      omschrijvingLower.includes('reservation') ||
      omschrijvingLower.startsWith('overboeking')
    ) {
      skipped++
      continue
    }

    let type: AccountEvent['type'] | null = null
    if (omschrijvingLower.includes('deposit') || omschrijvingLower.includes('storting')) {
      type = 'storting'
    } else if (omschrijvingLower === 'dividend') {
      type = 'dividend'
    } else if (omschrijvingLower.includes('dividendbelasting')) {
      type = 'dividendbelasting'
    } else {
      continue
    }

    const id = `${datumStr}-${tijdStr}-${omschrijving}-${isin}-${bedragStr}`
    if (existingIds.has(id)) { skipped++; continue }

    const event: AccountEvent = {
      id,
      datum: parseDegiroDate(datumStr, tijdStr),
      type,
      product,
      isin,
      bedrag: Math.abs(parseDegiroAmount(bedragStr)),
      omschrijving,
    }

    existingIds.add(id)
    newEvents.push(event)
    if (type === 'storting') stortingen++
    else if (type === 'dividend') dividenden++
  }

  return { events: newEvents, stortingen, dividenden, skipped }
}
