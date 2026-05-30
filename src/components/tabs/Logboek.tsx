import { useState, useMemo } from 'react'
import { formatEuro, formatPct, MAANDEN } from '../../utils/formatters'
import {
  calcMaandData, calcJaarPositieRendementen, calcGemiddeldJaarRendement,
  KORTE_NAAM, HISTORISCHE_KOERSEN,
} from '../../utils/calculations'
import type { MaandData, JaarPositieRendement } from '../../utils/calculations'
import type { Transaction, AccountEvent, ManualEntry } from '../../types'

interface Props {
  transactions: Transaction[]
  accountEvents: AccountEvent[]
  manualEntries: ManualEntry[]
  onNavigateToToekomst: (rendement: number) => void
}

function getYears(transactions: Transaction[], manualEntries: ManualEntry[]): number[] {
  const years = new Set<number>()
  for (const t of transactions) years.add(new Date(t.datum).getFullYear())
  for (const m of manualEntries) years.add(new Date(m.datum).getFullYear())
  if (years.size === 0) years.add(new Date().getFullYear())
  return Array.from(years).sort()
}

// ─── Month tile ──────────────────────────────────────────────────────────────

function MonthTile({
  maand, data, isSelected, onClick,
}: {
  maand: number; data: MaandData; isSelected: boolean; onClick: () => void
}) {
  const isActive = data.hasPosities
  const isPos    = data.rendementEuro >= 0

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-4 text-left transition-all min-h-[108px] border ${
        !isActive
          ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/40 opacity-50 cursor-default'
          : isSelected
          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600'
          : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700'
      }`}
    >
      <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">{MAANDEN[maand]}</p>

      {isActive ? (
        <>
          {data.rendementEuro !== 0 ? (
            <>
              <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatPct(data.rendementPct, 1)}
              </p>
              <p className={`text-xs tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatEuro(data.rendementEuro)}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-gray-500 tabular-nums">—</p>
          )}
          {data.hadAankopen && (
            <p className="mt-1.5 text-xs text-blue-500 dark:text-blue-400 font-medium">
              {data.aankopen.length} aankoop{data.aankopen.length !== 1 ? 'en' : ''}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Geen posities</p>
      )}
    </button>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ maand, year, data, onClose }: {
  maand: number; year: number; data: MaandData; onClose: () => void
}) {
  const totalGeinvesteerd = data.aankopen.reduce((s, t) => s + Math.abs(t.totaal), 0)
  const totalKosten       = data.aankopen.reduce((s, t) => s + t.transactiekosten, 0)
  const hasRendement      = data.positieDetails.some(p => p.koersEindMaand > 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-blue-200 dark:border-blue-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
        <h3 className="font-bold text-blue-700 dark:text-blue-300 text-base">
          {MAANDEN[maand]} {year} — aankopen
        </h3>
        <div className="flex items-center gap-3">
          {data.waardeEindeMaand > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              Portefeuille: <span className="font-semibold tabular-nums">{formatEuro(data.waardeEindeMaand)}</span>
            </span>
          )}
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-lg">
            ×
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
        {/* Aankopen als kaartjes */}
        {data.aankopen.length > 0 ? (
          <>
            {data.aankopen.map(t => (
              <div key={t.id} className="px-5 py-4 flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">{new Date(t.datum).toLocaleDateString('nl-NL')}</p>
                  <p className="font-medium text-gray-800 dark:text-white text-sm truncate">{t.product}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                    {t.aantal}× @ {formatEuro(t.koers)}
                  </p>
                  <p className="text-xs text-gray-400 tabular-nums">
                    Transactiekosten: {formatEuro(t.transactiekosten)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatEuro(Math.abs(t.totaal))}
                  </p>
                  <p className="text-xs text-gray-400">totaal betaald</p>
                </div>
              </div>
            ))}

            {/* Totaal rij */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/30 space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-700 dark:text-gray-200">Totaal geïnvesteerd</span>
                <span className="tabular-nums">{formatEuro(totalGeinvesteerd)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Waarvan transactiekosten</span>
                <span className="tabular-nums">{formatEuro(totalKosten)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Geen aankopen — wel posities actief
            </p>
          </div>
        )}

        {/* Rendement per positie */}
        {hasRendement && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
              Rendement
            </p>
            {data.positieDetails.map(p => {
              if (!p.koersEindMaand) return null
              const isPos = p.rendementEuro >= 0
              const naam  = KORTE_NAAM[p.isin] ?? p.product.slice(0, 14)
              return (
                <div key={p.isin} className="flex justify-between items-baseline gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate">{naam}</span>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {formatPct(p.rendementPct, 1)} ({formatEuro(p.rendementEuro)})
                  </span>
                </div>
              )
            })}
            {data.rendementEuro !== 0 && (
              <div className={`flex justify-between items-baseline gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-700 ${
                data.rendementEuro >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
              }`}>
                <span className="text-sm font-bold">Portefeuille</span>
                <span className="text-sm font-bold tabular-nums shrink-0">
                  {formatPct(data.rendementPct, 2)} ({formatEuro(data.rendementEuro)})
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Jaaroverzicht ───────────────────────────────────────────────────────────

interface JaarStats {
  totalRendementEuro: number
  rendementPctJaar: number
  besteMaand: { naam: string; pct: number } | null
  slechtsteMaand: { naam: string; pct: number } | null
  totaalIngelegd: number
  totaalKosten: number
  positieRendementen: JaarPositieRendement[]
  suggestieRendement: number | null
  dataSpan: { eerste: string; laatste: string }  // e.g. "jul 2024" – "mei 2026"
}

function PositieRegel({ p }: { p: JaarPositieRendement }) {
  const isPos   = p.rendementEuro >= 0
  const naam    = KORTE_NAAM[p.isin] ?? p.product
  const kortNaam = naam.length > 12 ? naam.slice(0, 11) + '…' : naam
  const aantalStr = Number.isInteger(p.aantalEindJaar)
    ? `${p.aantalEindJaar}×`
    : `${p.aantalEindJaar.toFixed(2)}×`

  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm whitespace-nowrap">{kortNaam}</span>
        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{aantalStr}</span>
      </div>
      <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap hidden sm:block">
        {formatEuro(p.koersBeginJaar)} → {formatEuro(p.koersEindJaar)}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-sm font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {formatPct(p.rendementPct, 1)}
        </span>
        <span className={`text-sm font-medium tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {formatEuro(p.rendementEuro)}
        </span>
      </div>
    </div>
  )
}

function JaaroverzichtKaart({
  year, stats, onNavigateToToekomst,
}: {
  year: number
  stats: JaarStats
  onNavigateToToekomst: (rendement: number) => void
}) {
  const isPos = stats.totalRendementEuro >= 0

  return (
    <div className="col-span-2 sm:col-span-3 md:col-span-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Jaaroverzicht {year}
          </h3>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {formatEuro(stats.totalRendementEuro)}
            </p>
            <p className={`text-sm tabular-nums ${isPos ? 'text-green-500' : 'text-red-400'}`}>
              {formatPct(stats.rendementPctJaar)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Per-position year return ── */}
      {stats.positieRendementen.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700/50">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
            Rendement per positie
          </p>
          {stats.positieRendementen.map(p => <PositieRegel key={p.isin} p={p} />)}
        </div>
      )}

      {/* ── Maand highlights + financieel ── */}
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-50 dark:border-gray-700/50">
        {stats.besteMaand && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Beste maand</p>
            <p className="font-semibold text-green-700 dark:text-green-300 text-sm">{stats.besteMaand.naam}</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">{formatPct(stats.besteMaand.pct, 1)}</p>
          </div>
        )}
        {stats.slechtsteMaand && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">Slechtste maand</p>
            <p className="font-semibold text-red-700 dark:text-red-300 text-sm">{stats.slechtsteMaand.naam}</p>
            <p className="text-sm font-bold text-red-500 dark:text-red-400 tabular-nums">{formatPct(stats.slechtsteMaand.pct, 1)}</p>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
          <p className="text-xs text-gray-400 font-medium">Ingelegd</p>
          <p className="font-semibold text-gray-700 dark:text-gray-200 text-sm tabular-nums">{formatEuro(stats.totaalIngelegd)}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
          <p className="text-xs text-gray-400 font-medium">Transactiekosten</p>
          <p className="font-semibold text-gray-700 dark:text-gray-200 text-sm tabular-nums">{formatEuro(stats.totaalKosten)}</p>
        </div>
      </div>

      {/* ── Toekomst suggestion ── */}
      {stats.suggestieRendement !== null && (
        <div className="px-5 py-4 bg-blue-50 dark:bg-blue-900/20">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Gebaseerd op VUSA.AS ({stats.dataSpan.eerste}–{stats.dataSpan.laatste}):
                gemiddeld jaarsrendement ~{stats.suggestieRendement.toFixed(1)}%
              </p>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5">
                Als dit rendement de komende jaren aanhoudt, berekent de Toekomst-calculator dit in voor je.
              </p>
            </div>
            <button
              onClick={() => onNavigateToToekomst(stats.suggestieRendement!)}
              className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors whitespace-nowrap min-h-[44px]"
            >
              Gebruik in Toekomst-calculator →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Logboek({ transactions, accountEvents: _ae, manualEntries, onNavigateToToekomst }: Props) {
  const years = useMemo(() => getYears(transactions, manualEntries), [transactions, manualEntries])
  const [year, setYear] = useState(() => years[years.length - 1] ?? new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  const maandData: Record<number, MaandData> = useMemo(
    () => calcMaandData(transactions, year),
    [transactions, year],
  )

  const jaarStats = useMemo((): JaarStats | null => {
    const actief = (Object.entries(maandData) as [string, MaandData][]).filter(([, d]) => d.hasPosities)
    if (actief.length === 0) return null

    const totalRendementEuro = actief.reduce((s, [, d]) => s + d.rendementEuro, 0)
    const waardenMetData = actief.filter(([, d]) => d.waardeEindeMaand > 0)
    const beginWaarde = waardenMetData[0]?.[1].waardeEindeMaand ?? 0
    const eindWaarde  = waardenMetData[waardenMetData.length - 1]?.[1].waardeEindeMaand ?? 0
    const rendementPctJaar = beginWaarde > 0 ? ((eindWaarde - beginWaarde) / beginWaarde) * 100 : 0

    const metRendement = actief.filter(([, d]) => d.rendementEuro !== 0)
    const bestEntry  = metRendement.reduce<[string, MaandData] | null>(
      (b, c) => (!b || c[1].rendementPct > b[1].rendementPct) ? c : b, null)
    const worstEntry = metRendement.reduce<[string, MaandData] | null>(
      (w, c) => (!w || c[1].rendementPct < w[1].rendementPct) ? c : w, null)

    // Data span for the suggestion label ("jul 2024" – "mei 2026")
    const priceKeys = Object.keys(HISTORISCHE_KOERSEN['IE00B3XXRP09'] ?? {}).sort()
    const fmtSpan = (key: string) => {
      const [y, m] = key.split('-')
      return `${MAANDEN[parseInt(m) - 1].toLowerCase()} ${y}`
    }
    const dataSpan = priceKeys.length >= 2
      ? { eerste: fmtSpan(priceKeys[0]), laatste: fmtSpan(priceKeys[priceKeys.length - 1]) }
      : { eerste: '', laatste: '' }

    return {
      totalRendementEuro,
      rendementPctJaar,
      besteMaand:     bestEntry  ? { naam: MAANDEN[parseInt(bestEntry[0])],  pct: bestEntry[1].rendementPct  } : null,
      slechtsteMaand: worstEntry ? { naam: MAANDEN[parseInt(worstEntry[0])], pct: worstEntry[1].rendementPct } : null,
      totaalIngelegd: actief.reduce((s, [, d]) => s + d.aankopen.reduce((a, t) => a + Math.abs(t.totaal), 0), 0),
      totaalKosten:   actief.reduce((s, [, d]) => s + d.aankopen.reduce((a, t) => a + t.transactiekosten, 0), 0),
      positieRendementen: calcJaarPositieRendementen(transactions, year),
      suggestieRendement: calcGemiddeldJaarRendement(),
      dataSpan,
    }
  }, [maandData, transactions, year])

  if (transactions.length === 0 && manualEntries.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-gray-500">
        <p className="text-3xl mb-2">📅</p>
        <p>Importeer data om het logboek te vullen</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Year navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => { setYear(y => Math.max(years[0], y - 1)); setSelectedMonth(null) }}
          disabled={year <= years[0]}
          className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 min-h-[44px] min-w-[44px]"
        >‹</button>
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">{year}</h2>
        <button
          onClick={() => { setYear(y => Math.min(years[years.length - 1], y + 1)); setSelectedMonth(null) }}
          disabled={year >= years[years.length - 1]}
          className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 min-h-[44px] min-w-[44px]"
        >›</button>
      </div>

      {/* Month grid + year summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, m) => (
          <MonthTile
            key={m}
            maand={m}
            data={maandData[m]}
            isSelected={selectedMonth === m}
            onClick={() => {
              if (!maandData[m].hasPosities) return
              setSelectedMonth(prev => prev === m ? null : m)
            }}
          />
        ))}
        {jaarStats && (
          <JaaroverzichtKaart
            year={year}
            stats={jaarStats}
            onNavigateToToekomst={onNavigateToToekomst}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedMonth !== null && maandData[selectedMonth] && (
        <DetailPanel maand={selectedMonth} year={year} data={maandData[selectedMonth]} onClose={() => setSelectedMonth(null)} />
      )}
    </div>
  )
}
