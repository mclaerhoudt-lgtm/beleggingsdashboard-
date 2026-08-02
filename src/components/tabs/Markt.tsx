import { useMemo, useState } from 'react'
import { MarketChart } from '../charts/MarketChart'
import type { MarketDataPoint } from '../charts/MarketChart'
import { formatEuro, formatPct, MAANDEN } from '../../utils/formatters'
import { calcJaarKoersRendement, calcGemiddeldJaarRendement } from '../../utils/calculations'
import type { Transaction, KoersCache, KoersHistorie } from '../../types'
import { ISIN_SYMBOLS } from '../../types'

interface Props {
  transactions: Transaction[]
  koersen: KoersCache
  koersHistorie: KoersHistorie
}

type JaarKeuze = 'alle' | number

// 'YYYY-MM' -> "jul 2024"
function maandLabel(key: string): string {
  const [y, m] = key.split('-')
  return `${MAANDEN[parseInt(m, 10) - 1].toLowerCase()} ${y}`
}

// Build the sorted list of ISINs: from transactions + fallback from koersHistorie
function buildIsins(transactions: Transaction[], koersHistorie: KoersHistorie): Array<{ isin: string; product: string }> {
  const seen = new Map<string, string>()
  for (const t of transactions) {
    if (t.isin && t.product && !seen.has(t.isin)) seen.set(t.isin, t.product)
  }
  // Also include ISINs with historical data that the user may only have dividends for
  for (const isin of Object.keys(koersHistorie)) {
    if (!seen.has(isin)) seen.set(isin, isin)
  }
  return Array.from(seen.entries()).map(([isin, product]) => ({ isin, product }))
}

export function Markt({ transactions, koersen, koersHistorie }: Props) {
  const isins = useMemo(() => buildIsins(transactions, koersHistorie), [transactions, koersHistorie])

  const [selectedIsin, setSelectedIsin] = useState<string>(() => isins[0]?.isin ?? '')
  const isin = (selectedIsin || isins[0]?.isin) ?? ''

  const [gekozenJaar, setGekozenJaar] = useState<JaarKeuze>('alle')

  // Jaren waarvoor dit aandeel data heeft, plus altijd het lopende jaar (zodat je
  // year-to-date kunt kiezen ook als er nog geen afgesloten maand voor dit jaar is).
  const beschikbareJaren = useMemo(() => {
    const priceMap = koersHistorie[isin]
    const jaren = new Set<number>()
    if (priceMap) {
      for (const key of Object.keys(priceMap)) jaren.add(parseInt(key.slice(0, 4), 10))
    }
    jaren.add(new Date().getFullYear())
    return Array.from(jaren).sort((a, b) => a - b)
  }, [isin, koersHistorie])

  // Valt terug op "alle" als de eerder gekozen jaar niet (meer) bestaat voor dit aandeel
  const selectedYear: JaarKeuze = gekozenJaar === 'alle' || beschikbareJaren.includes(gekozenJaar)
    ? gekozenJaar
    : 'alle'

  const symbol    = ISIN_SYMBOLS[isin]
  const koersData = symbol ? koersen[symbol] : undefined

  const jaarRendement = useMemo(() => {
    if (selectedYear === 'alle') return null
    const live = koersData && koersData.price > 0 ? koersData.price : undefined
    return calcJaarKoersRendement(koersHistorie[isin], selectedYear, live)
  }, [selectedYear, koersHistorie, isin, koersData])

  const gemiddeldRendement = useMemo(() => {
    if (selectedYear !== 'alle') return null
    return calcGemiddeldJaarRendement(koersHistorie[isin])
  }, [selectedYear, koersHistorie, isin])

  // Build chart data from koersHistorie (live-fetched monthly closes), optioneel
  // gefilterd op het gekozen jaar (plus de decemberslotkoers ervoor als ijkpunt).
  const chartData = useMemo((): MarketDataPoint[] => {
    const priceMap = koersHistorie[isin]
    if (!priceMap) return []

    const alleEntries = Object.entries(priceMap).sort(([a], [b]) => a.localeCompare(b))
    const entries = selectedYear === 'alle'
      ? alleEntries
      : alleEntries.filter(([key]) => key.startsWith(`${selectedYear}-`) || key === `${(selectedYear as number) - 1}-12`)

    const points: MarketDataPoint[] = entries.map(([key, koers], i) => {
      const prevKoers = i > 0 ? entries[i - 1][1] : koers
      const rendement = i > 0 && prevKoers > 0 ? ((koers - prevKoers) / prevKoers) * 100 : 0
      const verschilEuro = i > 0 ? koers - prevKoers : 0
      const [y, m] = key.split('-')
      return {
        label: `${MAANDEN[parseInt(m) - 1]} '${y.slice(2)}`,
        koers,
        rendement: parseFloat(rendement.toFixed(2)),
        verschilEuro: parseFloat(verschilEuro.toFixed(2)),
        isBest: false,
        isWorst: false,
      }
    })

    // Mark best and worst (skip index 0 — no prior month to compare)
    if (points.length > 1) {
      let bestI = 1, worstI = 1
      for (let i = 2; i < points.length; i++) {
        if (points[i].rendement > points[bestI].rendement) bestI = i
        if (points[i].rendement < points[worstI].rendement) worstI = i
      }
      points[bestI].isBest  = true
      points[worstI].isWorst = true
    }

    return points
  }, [isin, koersHistorie, selectedYear])

  const selectedProduct = isins.find(p => p.isin === isin)?.product ?? isin
  const best  = chartData.find(d => d.isBest)
  const worst = chartData.find(d => d.isWorst)

  if (isins.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <p className="text-3xl mb-2">🌍</p>
        <p>Importeer transacties om marktdata te zien</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Aandeel-selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {isins.map(({ isin: id, product }) => (
          <button
            key={id}
            onClick={() => setSelectedIsin(id)}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors min-h-[44px] ${
              isin === id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            {product.length > 30 ? product.slice(0, 28) + '…' : product}
          </button>
        ))}
      </div>

      {/* Jaar-selector */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setGekozenJaar('alle')}
          className={`shrink-0 px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition-colors min-h-[44px] ${
            selectedYear === 'alle'
              ? 'bg-gray-800 text-white border-gray-800 dark:bg-gray-200 dark:text-gray-900 dark:border-gray-200'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
          }`}
        >
          Alle jaren
        </button>
        {beschikbareJaren.map(jaar => (
          <button
            key={jaar}
            onClick={() => setGekozenJaar(jaar)}
            className={`shrink-0 px-3.5 py-1.5 rounded-xl text-sm font-medium border transition-colors min-h-[44px] ${
              selectedYear === jaar
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            {jaar}
          </button>
        ))}
      </div>

      {/* Jaarrendement van het gekozen jaar */}
      {selectedYear !== 'alle' && jaarRendement && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <p className="text-xs text-gray-400">Jaarrendement {selectedYear}</p>
                {jaarRendement.isYtd && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                    YTD
                  </span>
                )}
                {jaarRendement.vanafMaand != null && (
                  <span className="text-[10px] text-gray-400">vanaf {MAANDEN[jaarRendement.vanafMaand]}</span>
                )}
              </div>
              {jaarRendement.rendementPct == null ? (
                <p className="text-lg font-bold text-gray-400 dark:text-gray-500">± Schatting — onvoldoende data</p>
              ) : (
                <>
                  <p className={`text-2xl font-bold tabular-nums ${jaarRendement.rendementPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {formatPct(jaarRendement.rendementPct, 1)}
                  </p>
                  <p className={`text-sm tabular-nums ${jaarRendement.rendementEuro >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                    {jaarRendement.rendementEuro >= 0 ? '+' : ''}{formatEuro(jaarRendement.rendementEuro)} per aandeel
                  </p>
                </>
              )}
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>Begin → eind</p>
              <p className="font-medium text-gray-600 dark:text-gray-300 tabular-nums">
                {formatEuro(jaarRendement.koersBegin)} → {formatEuro(jaarRendement.koersEind)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Gemiddeld jaarrendement (CAGR) over de hele beschikbare historie — alleen bij "Alle jaren" */}
      {selectedYear === 'alle' && gemiddeldRendement && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Gemiddeld jaarrendement (CAGR)</p>
              <p className={`text-2xl font-bold tabular-nums ${gemiddeldRendement.rendementPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatPct(gemiddeldRendement.rendementPct, 1)}
              </p>
              <p className="text-xs text-gray-400">per jaar, samengesteld over {gemiddeldRendement.jaren.toFixed(1)} jaar</p>
            </div>
            <div className="text-right text-xs text-gray-400">
              <p>Periode</p>
              <p className="font-medium text-gray-600 dark:text-gray-300">
                {maandLabel(gemiddeldRendement.vanaf)} – {maandLabel(gemiddeldRendement.tot)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Live stats row */}
      {koersData && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Live koers</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white tabular-nums">{formatEuro(koersData.price)}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Dag %</p>
            <p className={`text-xl font-bold tabular-nums ${koersData.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {formatPct(koersData.changePercent)}
            </p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 mb-1">Dag verandering</p>
            <p className={`text-xl font-bold tabular-nums ${koersData.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {koersData.change >= 0 ? '+' : ''}{formatEuro(koersData.change)}
            </p>
          </div>
        </div>
      )}

      {/* Best / worst highlights */}
      {best && worst && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-4 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Beste maand{selectedYear !== 'alle' ? ` (${selectedYear})` : ''}</p>
            <p className="font-bold text-green-700 dark:text-green-300">{best.label}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{formatPct(best.rendement)}</p>
            <p className="text-xs text-green-500 tabular-nums">{formatEuro(best.koers)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Slechtste maand{selectedYear !== 'alle' ? ` (${selectedYear})` : ''}</p>
            <p className="font-bold text-red-700 dark:text-red-300">{worst.label}</p>
            <p className="text-lg font-bold text-red-500 dark:text-red-400 tabular-nums">{formatPct(worst.rendement)}</p>
            <p className="text-xs text-red-400 tabular-nums">{formatEuro(worst.koers)}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">
          {selectedProduct.length > 50 ? selectedProduct.slice(0, 48) + '…' : selectedProduct}
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          {selectedYear === 'alle'
            ? <>De koers van {selectedProduct} aan het einde van elke afgesloten maand, over de beschikbare historie (circa 5 jaar via Yahoo Finance). De lopende maand staat hier bewust nog niet in — die volg je live via de koerscijfers hierboven.</>
            : <>De koers van {selectedProduct} aan het einde van elke afgesloten maand in {selectedYear}, inclusief de decemberslotkoers van het jaar ervoor als ijkpunt voor januari.</>}
        </p>
        <MarketChart data={chartData} name={selectedProduct} />
      </div>
    </div>
  )
}
