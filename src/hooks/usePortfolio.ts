import { useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { calcPositions, calcPortfolioValue, calcTotaalIngelegd } from '../utils/calculations'
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

  const portfolioValue = useMemo(() => calcPortfolioValue(positions), [positions])
  const totaalIngelegd = useMemo(() => calcTotaalIngelegd(accountEvents), [accountEvents])
  const rendement = portfolioValue - totaalIngelegd
  const rendementPct = totaalIngelegd > 0 ? (rendement / totaalIngelegd) * 100 : 0
  const reeel = portfolioValue / Math.pow(1 + settings.inflatie / 100, new Date().getFullYear() - 2020)

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
    resetAll,
  }
}
