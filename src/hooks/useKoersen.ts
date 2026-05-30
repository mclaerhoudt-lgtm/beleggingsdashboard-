import { useState, useEffect, useCallback, useRef } from 'react'
import type { KoersCache, KoersData } from '../types'
import { useLocalStorage } from './useLocalStorage'

// Symbols requested from /api/quote (Vercel Edge Function or dev mock)
const SYMBOLS = ['VUSA.AS', 'ASML.AS']
const CACHE_KEY = 'bdash_koersen_cache'
const REFRESH_MS = 60_000

// Direct Yahoo fetch — runs in the browser; may fail due to CORS.
// Used as a fallback when /api/quote is completely unavailable.
async function fetchYahooDirect(symbol: string): Promise<KoersData | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return null
    const json = await res.json() as { chart: { result: Array<{ meta: Record<string, unknown> }> } }
    const meta = json.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    const price = meta.regularMarketPrice as number
    const prev = ((meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price)) as number
    return {
      symbol,
      price,
      change: price - prev,
      changePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency: (meta.currency as string) ?? 'EUR',
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return null   // CORS or network error — caller uses cached data
  }
}

export function useKoersen() {
  const [cache, setCache] = useLocalStorage<KoersCache>(CACHE_KEY, {})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Keep a ref so the interval callback always sees the latest cache value
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  const fetchKoersen = useCallback(async () => {
    setLoading(true)
    setError(null)

    // ── Primary path: /api/quote (Edge Function in prod, dev mock in dev) ──
    try {
      const res = await fetch(`/api/quote?symbols=${SYMBOLS.join(',')}`, {
        signal: AbortSignal.timeout(12_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: KoersData[] = await res.json()

      setCache(prev => {
        const next = { ...prev }
        for (const d of data) {
          // Only overwrite cache entry when we received a valid price
          if (d.price > 0) next[d.symbol] = d
        }
        return next
      })
      setLoading(false)
      return
    } catch (apiErr) {
      // /api/quote unreachable — try Yahoo Finance directly from the browser
      // (works without CORS on some networks; silently skipped if blocked)
    }

    // ── Fallback: direct browser → Yahoo Finance ──
    try {
      const results = await Promise.all(SYMBOLS.map(fetchYahooDirect))
      const any = results.some(r => r !== null)
      if (any) {
        setCache(prev => {
          const next = { ...prev }
          for (const d of results) {
            if (d && d.price > 0) next[d.symbol] = d
          }
          return next
        })
        setError(null)
      } else {
        setError('Koersen niet beschikbaar (CORS beperking). Gebruik Vercel deploy voor live koersen.')
      }
    } catch {
      setError('Koersen tijdelijk niet beschikbaar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKoersen()
    const id = setInterval(fetchKoersen, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchKoersen])

  return { koersen: cache, loading, error, refresh: fetchKoersen }
}

export function koersAge(koersData: KoersData | undefined): 'fresh' | 'recent' | 'old' {
  if (!koersData?.updatedAt) return 'old'
  const diff = Date.now() - new Date(koersData.updatedAt).getTime()
  if (diff < 5 * 60 * 1000) return 'fresh'
  if (diff < 60 * 60 * 1000) return 'recent'
  return 'old'
}
