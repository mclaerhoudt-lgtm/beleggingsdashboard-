import { StatusDot } from '../ui/StatusDot'
import { AllocChart } from '../charts/AllocChart'
import { formatEuro, formatPct } from '../../utils/formatters'
import type { Position, KoersCache } from '../../types'
import { ISIN_SYMBOLS } from '../../types'

interface Props {
  positions: Position[]
  koersen: KoersCache
  loading: boolean
}

export function Posities({ positions, koersen, loading }: Props) {
  const totalWaarde = positions.reduce((s, p) => s + p.waarde, 0)

  const allocData = positions.map(p => ({ name: p.product, value: p.waarde }))

  if (loading && positions.length === 0) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => (
          <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    )
  }

  if (positions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 dark:text-gray-500">
        <p className="text-3xl mb-2">📈</p>
        <p>Nog geen posities. Importeer je DEGIRO transacties.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Positions table */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3">Positie</th>
                <th className="px-4 py-3 text-right">Aantal</th>
                <th className="px-4 py-3 text-right">Gem. prijs</th>
                <th className="px-4 py-3 text-right">Huidige koers</th>
                <th className="px-4 py-3 text-right">Waarde</th>
                <th className="px-4 py-3 text-right">Rendement</th>
                <th className="px-4 py-3 text-right">Dividend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {positions.map(p => {
                const symbol = ISIN_SYMBOLS[p.isin]
                const koersData = symbol ? koersen[symbol] : undefined
                const isPos = p.rendementEuro >= 0

                return (
                  <tr key={p.isin} className="text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <StatusDot koersData={koersData} />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{p.product}</p>
                          <p className="text-xs text-gray-400">{p.isin}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">{p.aantal.toFixed(4)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">{formatEuro(p.gemAankoopprijs)}</td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1.5 group/koers relative">
                        {p.huidigeKoers > 0
                          ? formatEuro(p.huidigeKoers)
                          : <span className="text-gray-400">—</span>}
                        {symbol && (
                          <span className="text-gray-300 dark:text-gray-600 text-xs cursor-help select-none shrink-0">ⓘ
                            <span className="absolute right-0 bottom-full mb-1.5 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/koers:opacity-100 transition-opacity pointer-events-none z-20 shadow-lg">
                              Koers via Yahoo Finance<br />
                              <span className="font-mono text-blue-300">{symbol}</span>
                            </span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums font-medium">
                      {p.waarde > 0 ? formatEuro(p.waarde) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className={`px-4 py-4 text-right tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                      <div>{formatEuro(p.rendementEuro)}</div>
                      <div className="text-xs">{formatPct(p.rendementPct)}</div>
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      <div>{formatEuro(p.nettoDividend)}</div>
                      <div className="text-xs text-gray-400">{formatPct(p.dividendrendementPct)}</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-700/30">
              <tr className="text-gray-700 dark:text-gray-300 font-semibold">
                <td className="px-4 py-3">Totaal</td>
                <td></td><td></td><td></td>
                <td className="px-4 py-3 text-right tabular-nums">{formatEuro(totalWaarde)}</td>
                <td></td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatEuro(positions.reduce((s, p) => s + p.nettoDividend, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Allocation chart */}
      {allocData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-4">Portefeuilleverdeling</h2>
          <AllocChart data={allocData} />
        </div>
      )}
    </div>
  )
}
