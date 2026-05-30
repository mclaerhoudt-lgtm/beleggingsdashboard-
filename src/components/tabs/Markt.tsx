import { useState, useMemo } from 'react'
import { MarketChart } from '../charts/MarketChart'
import type { MarketDataPoint } from '../charts/MarketChart'
import { formatEuro, formatPct, MAANDEN } from '../../utils/formatters'
import type { Transaction, KoersCache } from '../../types'
import { ISIN_SYMBOLS } from '../../types'
import { HISTORISCHE_KOERSEN } from '../../utils/calculations'

interface Props {
  transactions: Transaction[]
  koersen: KoersCache
}

// Build the sorted list of ISINs: from transactions + fallback from HISTORISCHE_KOERSEN
function buildIsins(transactions: Transaction[]): Array<{ isin: string; product: string }> {
  const seen = new Map<string, string>()
  for (const t of transactions) {
    if (t.isin && t.product && !seen.has(t.isin)) seen.set(t.isin, t.product)
  }
  // Also include ISINs with historical data that the user may only have dividends for
  for (const isin of Object.keys(HISTORISCHE_KOERSEN)) {
    if (!seen.has(isin)) seen.set(isin, isin)
  }
  return Array.from(seen.entries()).map(([isin, product]) => ({ isin, product }))
}

export function Markt({ transactions, koersen }: Props) {
  const isins = useMemo(() => buildIsins(transactions), [transactions])

  const [selectedIsin, setSelectedIsin] = useState<string>(() => isins[0]?.isin ?? '')
  const isin = (selectedIsin || isins[0]?.isin) ?? ''

  // Build chart data from HISTORISCHE_KOERSEN (23 data points per ISIN)
  const chartData = useMemo((): MarketDataPoint[] => {
    const priceMap = HISTORISCHE_KOERSEN[isin]
    if (!priceMap) return []

    const entries = Object.entries(priceMap).sort(([a], [b]) => a.localeCompare(b))
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
  }, [isin])

  const selectedProduct = isins.find(p => p.isin === isin)?.product ?? isin
  const symbol    = ISIN_SYMBOLS[isin]
  const koersData = symbol ? koersen[symbol] : undefined
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
      {/* Selector */}
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
            <p className="text-xs text-green-600 dark:text-green-400 font-medium mb-1">Beste maand</p>
            <p className="font-bold text-green-700 dark:text-green-300">{best.label}</p>
            <p className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">{formatPct(best.rendement)}</p>
            <p className="text-xs text-green-500 tabular-nums">{formatEuro(best.koers)}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Slechtste maand</p>
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
        <p className="text-xs text-gray-400 mb-4">Maand-eindkoers — historische data</p>
        <MarketChart data={chartData} name={selectedProduct} />
      </div>
    </div>
  )
}
