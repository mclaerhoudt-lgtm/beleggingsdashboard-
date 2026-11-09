import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { KoersHistorie } from '../types'
import { ISIN_SYMBOLS } from '../types'

const SYMBOLS = Object.values(ISIN_SYMBOLS)
// v3: bumped omdat de maandlabeling voorheen met één vaste gmtoffset gebeurde,
// die alleen op het moment van ophalen klopt — over een zomer/wintertijd-grens
// (bv. eind oktober) is die een uur mis, waardoor die maand (oktober) in élk
// jaar van de reeks ontbrak. Een nieuwe cache-key dwingt een volledig verse
// fetch af zodat al gecachte, verkeerd gelabelde data niet blijft hangen tot
// toevallig "vorige maand" weer oktober is.
const CACHE_KEY = 'bdash_historische_koersen_v3'
// Zelfde reden als hierboven, maar dan voor de browser/CDN-HTTP-cache: de
// /api/quote?history=1-response heeft max-age=3600. Browsers die vóór deze
// fix live ging al een (foutieve) response cachten, zouden die tot een uur
// blijven hergebruiken zonder de server opnieuw te raken. Een nieuwe query-
// parameter maakt het een ander URL, dus een gegarandeerd verse fetch.
const HISTORY_VERSION = 3

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

// De laatst-afgesloten kalendermaand (huidige maand − 1) — gebruikt om te
// detecteren of de zojuist afgesloten maand al "gepromoveerd" is van live
// koers naar historie. Zonder deze check blijft die maand soms +0,0% tonen
// tot de volgende kalendermaand-wissel toevallig een refetch triggert.
function vorigeMaandKey(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
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
      // &m=<huidige maand> maakt de URL per kalendermaand uniek, zodat browser-
      // cache/CDN/service-worker nooit een maand-oude response (waarin de net
      // afgesloten maand nog ontbreekt) blijven hergebruiken.
      const res = await fetch(`/api/quote?history=1&v=${HISTORY_VERSION}&m=${huidigeMaandKey()}&symbols=${SYMBOLS.join(',')}`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: HistorieResponseItem[] = await res.json()

      setCache(prev => {
        const bySymbol = { ...prev.bySymbol }
        let alleGelukt = true
        for (const { symbol, prices } of data) {
          if (prices.length === 0) { alleGelukt = false; continue } // server-side fetch failed for this symbol — keep old data
          bySymbol[symbol] = Object.fromEntries(prices.map(p => [p.month, p.close]))
        }
        // Alleen fetchedMonth bijwerken als echt alle symbolen gelukt zijn — anders
        // blokkeert de effect-gate hieronder een hernieuwde poging tot volgende maand,
        // terwijl er dan mogelijk nog verouderde/foute data voor een symbool achterblijft.
        return { fetchedMonth: alleGelukt ? huidigeMaandKey() : prev.fetchedMonth, bySymbol }
      })
    } catch {
      // Network error — keep existing cached data, retry next mount/month
      setError('Historische koersen konden niet worden opgehaald — gecachte data wordt gebruikt')
    } finally {
      setLoading(false)
    }
  }, [setCache])

  // Voorkomt een refetch-loop wanneer de vorige maand écht nooit gevuld raakt
  // (bv. een symbool bestond toen nog niet) — probeer de gat-fix maximaal één
  // keer per sessie i.p.v. bij elke render opnieuw.
  const gapFetchGeprobeerd = useRef(false)

  useEffect(() => {
    if (cache.fetchedMonth !== huidigeMaandKey()) {
      // Defer to a microtask so the state updates inside fetchHistorie don't
      // run synchronously within the effect body itself.
      queueMicrotask(() => { fetchHistorie() })
      return
    }
    if (gapFetchGeprobeerd.current) return
    const vorige = vorigeMaandKey()
    const vorigeMaandOntbreekt = SYMBOLS.some(symbol => cache.bySymbol[symbol]?.[vorige] == null)
    if (vorigeMaandOntbreekt) {
      gapFetchGeprobeerd.current = true
      queueMicrotask(() => { fetchHistorie() })
    }
  }, [cache.fetchedMonth, cache.bySymbol, fetchHistorie])

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
