import { useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { calcPositions, calcPortfolioValue, calcTotaalIngelegd, calcEersteJaar, calcReeel, calcLaatsteDatum } from '../utils/calculations'
import type { Transaction, AccountEvent, ManualEntry, Settings, KoersCache } from '../types'
import { DEFAULT_SETTINGS } from '../types'

const KEYS = {
  transactions: 'bdash_transactions',
  accountEvents: 'bdash_account_events',
  manualEntries: 'bdash_manual_entries',
  settings: 'bdash_settings',
}

export function usePortfolio(koersen: KoersCache) {
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>(KEYS.transactions, [])
  const [accountEvents, setAccountEvents] = useLocalStorage<AccountEvent[]>(KEYS.accountEvents, [])
  const [manualEntries, setManualEntries] = useLocalStorage<ManualEntry[]>(KEYS.manualEntries, [])
  const [settings, setSettings] = useLocalStorage<Settings>(KEYS.settings, DEFAULT_SETTINGS)

  const positions = useMemo(
    () => calcPositions(transactions, accountEvents, koersen),
    [transactions, accountEvents, koersen],
  )

  // When there is no CSV-derived data at all, fall back to the most recent manual entry
  // so a portfolio tracked purely via handmatige invoer still shows real numbers.
  const latestManualEntry = useMemo(
    () => manualEntries.length > 0
      ? [...manualEntries].sort((a, b) => b.datum.localeCompare(a.datum))[0]
      : null,
    [manualEntries],
  )
  const hasCsvData = transactions.length > 0

  const portfolioValue = useMemo(() => {
    const calc = calcPortfolioValue(positions)
    return !hasCsvData && latestManualEntry ? latestManualEntry.portefeuillewaarde : calc
  }, [positions, hasCsvData, latestManualEntry])

  const totaalIngelegd = useMemo(() => {
    const calc = calcTotaalIngelegd(accountEvents)
    return !hasCsvData && latestManualEntry ? latestManualEntry.totaalIngelegd : calc
  }, [accountEvents, hasCsvData, latestManualEntry])

  const rendement = portfolioValue - totaalIngelegd
  const rendementPct = totaalIngelegd > 0 ? (rendement / totaalIngelegd) * 100 : 0
  const eersteJaar = useMemo(() => calcEersteJaar(transactions, manualEntries), [transactions, manualEntries])
  const reeel = calcReeel(portfolioValue, settings.inflatie, new Date().getFullYear(), eersteJaar)
  const laatsteDatum = useMemo(() => calcLaatsteDatum(transactions, accountEvents), [transactions, accountEvents])

  function resetAll() {
    setTransactions([])
    setAccountEvents([])
    setManualEntries([])
  }

  return {
    transactions,
    setTransactions,
    accountEvents,
    setAccountEvents,
    manualEntries,
    setManualEntries,
    settings,
    setSettings,
    positions,
    portfolioValue,
    totaalIngelegd,
    rendement,
    rendementPct,
    reeel,
    eersteJaar,
    laatsteDatum,
    resetAll,
  }
}
