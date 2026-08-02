import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { KoersHistorie } from '../types'
import { ISIN_SYMBOLS } from '../types'

const SYMBOLS = Object.values(ISIN_SYMBOLS)
// v2: bumped omdat de maandlabeling voorheen in UTC i.p.v. beurstijd gebeurde
// (schoof candles rond maandgrenzen een maand terug) — dwingt een verse fetch
// af zodat al gecachte, verkeerd gelabelde data niet blijft hangen tot de
// volgende kalendermaand.
const CACHE_KEY = 'bdash_historische_koersen_v2'

interface HistorieResponseItem {
  symbol: string
  prices: Array<{ month: string; close: number }>
}

interface HistorieCache {
  fetchedMonth: string   // 'YYYY-MM' — calendar month this cache was last refreshed in
  bySymbol: Record<string, Record<string, number>>
}

const EMPTY_CACHE: HistorieCache = { fetchedMonth: '', bySymbol: {} }

function huidigeMaandKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Fetches monthly close prices (Yahoo Finance, via /api/quote?history=1) for every
// ISIN in ISIN_SYMBOLS, caches them in localStorage keyed by Yahoo symbol, and
// re-keys the result by ISIN for the rest of the app to join on.
export function useHistorischeKoersen() {
  const [cache, setCache] = useLocalStorage<HistorieCache>(CACHE_KEY, EMPTY_CACHE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistorie = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/quote?history=1&symbols=${SYMBOLS.join(',')}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: HistorieResponseItem[] = await res.json()

      setCache(prev => {
        const bySymbol = { ...prev.bySymbol }
        for (const { symbol, prices } of data) {
          if (prices.length === 0) continue   // server-side fetch failed for this symbol — keep old data
          bySymbol[symbol] = Object.fromEntries(prices.map(p => [p.month, p.close]))
        }
        return { fetchedMonth: huidigeMaandKey(), bySymbol }
      })
    } catch {
      // Network error — keep existing cached data, retry next mount/month
      setError('Historische koersen konden niet worden opgehaald — gecachte data wordt gebruikt')
    } finally {
      setLoading(false)
    }
  }, [setCache])

  useEffect(() => {
    if (cache.fetchedMonth === huidigeMaandKey()) return
    // Defer to a microtask so the state updates inside fetchHistorie don't
    // run synchronously within the effect body itself.
    queueMicrotask(() => { fetchHistorie() })
  }, [cache.fetchedMonth, fetchHistorie])

  // Re-key from Yahoo symbol -> ISIN, since the rest of the app joins on ISIN
  const koersHistorie = useMemo((): KoersHistorie => {
    const result: KoersHistorie = {}
    for (const [isin, symbol] of Object.entries(ISIN_SYMBOLS)) {
      if (cache.bySymbol[symbol]) result[isin] = cache.bySymbol[symbol]
    }
    return result
  }, [cache])

  return { koersHistorie, loading, error, refresh: fetchHistorie }
}
