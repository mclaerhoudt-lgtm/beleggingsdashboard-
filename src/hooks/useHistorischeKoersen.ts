import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { KoersHistorie } from '../types'
import { ISIN_SYMBOLS } from '../types'
import { afleidenMaandKoersen } from '../utils/calculations'

const SYMBOLS = Object.values(ISIN_SYMBOLS)
// v4: overgestapt van maandkoersen naar dagkoersen (voor de fijnmazige
// portefeuillegroei-grafiek in Overzicht) — nieuwe cache-key zodat de oude
// maand-cache niet per ongeluk als dag-cache gelezen wordt.
const CACHE_KEY = 'bdash_historische_koersen_dagelijks_v4'
// Zelfde reden als hierboven, maar dan voor de browser/CDN-HTTP-cache: de
// /api/quote?history=1-response heeft max-age=600. Een nieuwe query-parameter
// maakt het een ander URL, dus een gegarandeerd verse fetch i.p.v. een
// hergebruikte (oude, maand-gebaseerde) response.
const HISTORY_VERSION = 4

// Hoeveel kalenderdagen zonder nieuwe handelsdag-data acceptabel is voordat de
// historie als verouderd wordt beschouwd — ruim genoeg voor een lang weekend
// (vr. slotkoers nog niet verwerkt + weekend + maandag nog niet verwerkt).
const MAX_DAGEN_ZONDER_DATA = 4

interface HistorieResponseItem {
  symbol: string
  prices: Array<{ dag: string; close: number }>
}

interface HistorieCache {
  fetchedDay: string   // 'YYYY-MM-DD' — kalenderdag waarop dit voor het laatst (volledig) gelukt is
  bySymbol: Record<string, Record<string, number>>   // symbol -> 'YYYY-MM-DD' -> close
}

const EMPTY_CACHE: HistorieCache = { fetchedDay: '', bySymbol: {} }

function huidigeMaandKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function vandaagKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dagenTussen(a: string, b: string): number {
  const msPerDag = 24 * 60 * 60 * 1000
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDag)
}

// Fetches daily close prices (Yahoo Finance, via /api/quote?history=1) for every
// ISIN in ISIN_SYMBOLS, caches them in localStorage keyed by Yahoo symbol, en
// re-keyt het resultaat op ISIN voor de rest van de app. Levert twee vormen:
// - koersHistorieDagelijks: ruwe dagkoersen (voor de fijnmazige groei-grafiek)
// - koersHistorie: daaruit afgeleide maand-eindkoersen (voor Logboek/Markt —
//   zelfde vorm/methode als voorheen, zie afleidenMaandKoersen)
export function useHistorischeKoersen() {
  const [cache, setCache] = useLocalStorage<HistorieCache>(CACHE_KEY, EMPTY_CACHE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistorie = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // &m=<huidige maand> maakt de URL per kalendermaand uniek, zodat browser-
      // cache/CDN/service-worker nooit een oude response blijven hergebruiken.
      const res = await fetch(`/api/quote?history=1&v=${HISTORY_VERSION}&m=${huidigeMaandKey()}&symbols=${SYMBOLS.join(',')}`, {
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: HistorieResponseItem[] = await res.json()

      setCache(prev => {
        const bySymbol = { ...prev.bySymbol }
        let alleGelukt = true
        for (const { symbol, prices } of data) {
          if (prices.length === 0) { alleGelukt = false; continue } // server-side fetch failed for this symbol — keep old data
          bySymbol[symbol] = Object.fromEntries(prices.map(p => [p.dag, p.close]))
        }
        // Alleen fetchedDay bijwerken als echt alle symbolen gelukt zijn — anders
        // blokkeert de effect-gate hieronder een hernieuwde poging, terwijl er dan
        // mogelijk nog verouderde/foute data voor een symbool achterblijft.
        return { fetchedDay: alleGelukt ? vandaagKey() : prev.fetchedDay, bySymbol }
      })
    } catch {
      // Network error — keep existing cached data, retry next mount/day
      setError('Historische koersen konden niet worden opgehaald — gecachte data wordt gebruikt')
    } finally {
      setLoading(false)
    }
  }, [setCache])

  // Voorkomt een refetch-loop wanneer recente data écht nooit bijkomt (bv. een
  // symbool bestaat niet meer) — probeer de gat-fix maximaal één keer per
  // sessie i.p.v. bij elke render opnieuw.
  const gapFetchGeprobeerd = useRef(false)

  useEffect(() => {
    const vandaag = vandaagKey()
    if (cache.fetchedDay !== vandaag) {
      // Defer to a microtask so the state updates inside fetchHistorie don't
      // run synchronously within the effect body itself.
      queueMicrotask(() => { fetchHistorie() })
      return
    }
    if (gapFetchGeprobeerd.current) return
    const verouderd = SYMBOLS.some(symbol => {
      const dagen = Object.keys(cache.bySymbol[symbol] ?? {})
      if (dagen.length === 0) return true
      const laatsteDag = dagen.sort().at(-1)!
      return dagenTussen(laatsteDag, vandaag) > MAX_DAGEN_ZONDER_DATA
    })
    if (verouderd) {
      gapFetchGeprobeerd.current = true
      queueMicrotask(() => { fetchHistorie() })
    }
  }, [cache.fetchedDay, cache.bySymbol, fetchHistorie])

  // Re-key from Yahoo symbol -> ISIN, since the rest of the app joins on ISIN
  const koersHistorieDagelijks = useMemo((): KoersHistorie => {
    const result: KoersHistorie = {}
    for (const [isin, symbol] of Object.entries(ISIN_SYMBOLS)) {
      if (cache.bySymbol[symbol]) result[isin] = cache.bySymbol[symbol]
    }
    return result
  }, [cache])

  // Maand-eindkoersen afgeleid uit de dagreeks — dit is wat Logboek/Markt/TWR
  // consumeren, exact zoals voorheen (zelfde vorm, zelfde methode).
  const koersHistorie = useMemo((): KoersHistorie => {
    const result: KoersHistorie = {}
    for (const [isin, dagMap] of Object.entries(koersHistorieDagelijks)) {
      result[isin] = afleidenMaandKoersen(dagMap)
    }
    return result
  }, [koersHistorieDagelijks])

  return { koersHistorie, koersHistorieDagelijks, loading, error, refresh: fetchHistorie }
}
