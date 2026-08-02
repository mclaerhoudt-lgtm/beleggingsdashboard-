import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
} from 'recharts'
import { formatEuro, formatPct, MAANDEN } from '../../utils/formatters'
import {
  calcMaandData, calcAlleMaandenData, naarMaandPunten,
  calcPeriodeOverzicht, calcPeriodeRendement, calcCumulatieveTwr, calcBenchmarkRendement,
  KORTE_NAAM,
} from '../../utils/calculations'
import type {
  MaandData, MaandDataPunt, JaarPositieRendement, PeriodeRendementResultaat, CumulatieveTwrPunt,
} from '../../utils/calculations'
import type { Transaction, AccountEvent, ManualEntry, KoersHistorie, KoersCache } from '../../types'
import { useLocalStorage } from '../../hooks/useLocalStorage'

const VUSA_ISIN = 'IE00B3XXRP09'
const PERIODE_KEY = 'bdash_logboek_periode'

type Periode = 'all-time' | number

interface Props {
  transactions: Transaction[]
  accountEvents: AccountEvent[]
  manualEntries: ManualEntry[]
  koersHistorie: KoersHistorie
  koersen: KoersCache
}

function getYears(transactions: Transaction[], manualEntries: ManualEntry[]): number[] {
  const years = new Set<number>()
  for (const t of transactions) years.add(new Date(t.datum).getFullYear())
  for (const m of manualEntries) years.add(new Date(m.datum).getFullYear())
  if (years.size === 0) years.add(new Date().getFullYear())
  return Array.from(years).sort()
}

// Render a percentage that may be undefined (no meaningful baseline, e.g. instapmaand)
function pctLabel(pct: number | null, decimals = 1): string {
  return pct == null ? 'n.v.t.' : formatPct(pct, decimals)
}

function maandJaarLabel(year: number, month: number): string {
  return `${MAANDEN[month]} ${year}`
}

// ─── Month tile ──────────────────────────────────────────────────────────────

function MonthTile({
  maand, data, isSelected, onClick,
}: {
  maand: number; data: MaandData; isSelected: boolean; onClick: () => void
}) {
  const isActive       = data.hasPosities
  const isInstapmaand  = isActive && data.rendementPct == null
  const isNeutraal     = isActive && data.rendementPct != null && Math.abs(data.rendementPct) < 0.05
  const isPos          = isActive && data.rendementPct != null && data.rendementPct >= 0

  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl p-4 text-left transition-all min-h-[108px] border ${
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
          {isInstapmaand ? (
            <p className="text-sm font-semibold text-blue-500 dark:text-blue-400">Instapmaand</p>
          ) : isNeutraal ? (
            <>
              <p className="text-lg font-bold tabular-nums text-gray-500 dark:text-gray-400">
                {pctLabel(data.rendementPct, 1)}
              </p>
              <p className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                {formatEuro(data.rendementEuro)}
              </p>
            </>
          ) : (
            <>
              <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {pctLabel(data.rendementPct, 1)}
              </p>
              <p className={`text-xs tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatEuro(data.rendementEuro)}
              </p>
            </>
          )}
          {data.nettoInleg !== 0 && (
            <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
              Inleg: {formatEuro(data.nettoInleg)}
            </p>
          )}
          {data.hadAankopen && (
            <p className="mt-1 text-xs text-blue-500 dark:text-blue-400 font-medium">
              {data.aankopen.length} aankoop{data.aankopen.length !== 1 ? 'en' : ''}
            </p>
          )}
          {data.isSchatting && (
            <span
              className="absolute top-3 right-3 text-xs text-gray-300 dark:text-gray-600"
              title="Gebaseerd op een tussentijdse of doorgetrokken koers, geen bevestigde maand-eindkoers"
            >
              ~
            </span>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">Geen posities</p>
      )}
    </button>
  )
}

// ─── Per-jaar samenvattingsregel (all-time modus) ────────────────────────────

function JaarRegel({ year, rendement, onClick }: {
  year: number; rendement: PeriodeRendementResultaat | null; onClick: () => void
}) {
  if (!rendement) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors min-h-[44px]"
      >
        <span className="font-semibold text-gray-700 dark:text-gray-200">{year}</span>
        <span className="text-sm text-gray-400 flex items-center gap-2">Geen data <span className="text-gray-300 dark:text-gray-600">›</span></span>
      </button>
    )
  }
  const isPos = rendement.rendementEuro >= 0
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors min-h-[44px]"
    >
      <span className="font-semibold text-gray-700 dark:text-gray-200">{year}</span>
      <div className="flex items-center gap-4">
        <span className={`text-sm font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {pctLabel(rendement.rendementPct, 1)}
        </span>
        <span className={`text-sm font-medium tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {formatEuro(rendement.rendementEuro)}
        </span>
        <span className="text-gray-300 dark:text-gray-600">›</span>
      </div>
    </button>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ maand, year, data, onClose }: {
  maand: number; year: number; data: MaandData; onClose: () => void
}) {
  const totalGeinvesteerd = data.aankopen.reduce((s, t) => s + Math.abs(t.totaal), 0)
  const totalOntvangen    = data.verkopen.reduce((s, t) => s + Math.abs(t.totaal), 0)
  const totalKosten       = [...data.aankopen, ...data.verkopen].reduce((s, t) => s + t.transactiekosten, 0)
  const positiesMetData   = data.positieDetails.filter(p => p.koersEindMaand > 0 || p.koersBeginMaand > 0)
  const heeftTransacties  = data.aankopen.length > 0 || data.verkopen.length > 0

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-blue-200 dark:border-blue-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
        <h3 className="font-bold text-blue-700 dark:text-blue-300 text-base">
          {MAANDEN[maand]} {year} — detail
        </h3>
        <div className="flex items-center gap-3">
          {data.waardeEindeMaand > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              Portefeuille: <span className="font-semibold tabular-nums">{formatEuro(data.waardeEindeMaand)}</span>
              {data.isSchatting && <span className="text-gray-400"> (schatting)</span>}
            </span>
          )}
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-lg">
            ×
          </button>
        </div>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
        {/* Aankopen + verkopen als kaartjes */}
        {heeftTransacties ? (
          <>
            {data.aankopen.map(t => (
              <div key={t.id} className="px-5 py-4 flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 mb-0.5">{new Date(t.datum).toLocaleDateString('nl-NL')} · aankoop</p>
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

            {data.verkopen.map(t => (
              <div key={t.id} className="px-5 py-4 flex justify-between gap-4 bg-orange-50/40 dark:bg-orange-900/10">
                <div className="min-w-0">
                  <p className="text-xs text-orange-400 mb-0.5">{new Date(t.datum).toLocaleDateString('nl-NL')} · verkoop</p>
                  <p className="font-medium text-gray-800 dark:text-white text-sm truncate">{t.product}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                    {Math.abs(t.aantal)}× @ {formatEuro(t.koers)}
                  </p>
                  <p className="text-xs text-gray-400 tabular-nums">
                    Transactiekosten: {formatEuro(t.transactiekosten)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-gray-900 dark:text-white tabular-nums">
                    {formatEuro(Math.abs(t.totaal))}
                  </p>
                  <p className="text-xs text-gray-400">ontvangen</p>
                </div>
              </div>
            ))}

            {/* Totaal rij */}
            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-700/30 space-y-1">
              {totalGeinvesteerd > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700 dark:text-gray-200">Totaal geïnvesteerd</span>
                  <span className="tabular-nums">{formatEuro(totalGeinvesteerd)}</span>
                </div>
              )}
              {totalOntvangen > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-gray-700 dark:text-gray-200">Totaal ontvangen (verkoop)</span>
                  <span className="tabular-nums">{formatEuro(totalOntvangen)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-400">
                <span>Waarvan transactiekosten</span>
                <span className="tabular-nums">{formatEuro(totalKosten)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>Netto inleg deze maand</span>
                <span className="tabular-nums">{formatEuro(data.nettoInleg)}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="px-5 py-4">
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">
              Geen transacties — wel posities actief
            </p>
          </div>
        )}

        {/* Koersrendement per positie (gecorrigeerd voor inleg) */}
        {positiesMetData.length > 0 && (
          <div className="px-5 py-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
              Koersrendement (gecorrigeerd voor inleg)
            </p>
            {positiesMetData.map(p => {
              const isPos = p.rendementEuro >= 0
              const naam  = KORTE_NAAM[p.isin] ?? p.product.slice(0, 14)
              return (
                <div key={p.isin} className="flex justify-between items-baseline gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                    {naam}
                    {p.isSchatting && <span className="text-gray-300 dark:text-gray-600"> ~</span>}
                  </span>
                  <span className={`text-sm font-semibold tabular-nums shrink-0 ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {pctLabel(p.rendementPct, 1)} ({formatEuro(p.rendementEuro)})
                  </span>
                </div>
              )
            })}
            <div className={`flex justify-between items-baseline gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-700 ${
              data.rendementEuro >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
            }`}>
              <span className="text-sm font-bold">Portefeuille</span>
              <span className="text-sm font-bold tabular-nums shrink-0">
                {pctLabel(data.rendementPct, 2)} ({formatEuro(data.rendementEuro)})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Opbouw (cumulatieve, geketende TWR) ─────────────────────────────────────

function OpbouwChart({ data }: { data: Array<{ label: string; cumPct: number }> }) {
  if (data.length < 2) return null
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradYtd" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3266ad" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3266ad" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={v => `${Number(v).toFixed(0)}%`} tick={{ fontSize: 10 }} width={36} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Cumulatief']} />
        <ReferenceLine y={0} stroke="#9ca3af" />
        <Area type="monotone" dataKey="cumPct" stroke="#3266ad" fill="url(#gradYtd)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Bijdrage-uitsplitsing: inleg vs koersrendement ──────────────────────────

function BijdrageBar({ nettoInleg, koersrendement }: { nettoInleg: number; koersrendement: number }) {
  const totaal   = nettoInleg + koersrendement
  const inlegAbs = Math.abs(nettoInleg)
  const rendAbs  = Math.abs(koersrendement)
  const som      = inlegAbs + rendAbs
  const inlegPct = som > 0 ? (inlegAbs / som) * 100 : 50

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
        <div className="bg-gray-400 dark:bg-gray-500" style={{ width: `${inlegPct}%` }} />
        <div className={koersrendement >= 0 ? 'bg-green-500' : 'bg-red-500'} style={{ width: `${100 - inlegPct}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-400">
          Inleg: <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{formatEuro(nettoInleg)}</span>
        </span>
        <span className={koersrendement >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
          Koersrendement: <span className="font-semibold tabular-nums">{formatEuro(koersrendement)}</span>
        </span>
      </div>
      <p className="text-xs text-gray-400">
        Totale waardegroei (inleg + koersrendement): <span className="font-semibold tabular-nums text-gray-600 dark:text-gray-300">{formatEuro(totaal)}</span>
      </p>
    </div>
  )
}

// ─── Rendement per aandeel ────────────────────────────────────────────────────

function PositieRegel({ p, bijdragePct }: { p: JaarPositieRendement; bijdragePct: number | null }) {
  const isPos   = p.rendementEuro >= 0
  const naam    = KORTE_NAAM[p.isin] ?? p.product
  const kortNaam = naam.length > 14 ? naam.slice(0, 13) + '…' : naam
  const aantalStr = Number.isInteger(p.aantalEindJaar)
    ? `${p.aantalEindJaar}×`
    : `${p.aantalEindJaar.toFixed(2)}×`

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-semibold text-gray-700 dark:text-gray-200 text-sm whitespace-nowrap">{kortNaam}</span>
        <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">{aantalStr}</span>
      </div>
      <div className="text-xs text-gray-400 tabular-nums whitespace-nowrap hidden sm:block">
        {formatEuro(p.koersBeginJaar)} → {formatEuro(p.koersEindJaar)}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {bijdragePct != null && (
          <span className="text-xs text-gray-400 tabular-nums hidden md:inline">{bijdragePct.toFixed(0)}% v/d totaal</span>
        )}
        <span className={`text-base font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {pctLabel(p.rendementPct, 1)}
        </span>
        <span className={`text-sm font-medium tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {formatEuro(p.rendementEuro)}
        </span>
      </div>
    </div>
  )
}

// ─── Overzichtkaart (los jaar of all-time) ────────────────────────────────────

interface PeriodeStats {
  jaarRendement: PeriodeRendementResultaat
  cumulatieveTwr: CumulatieveTwrPunt[]
  positieRendementen: JaarPositieRendement[]
  benchmarkPct: number | null
}

function OverzichtKaart({ titel, isAllTime, stats }: { titel: string; isAllTime: boolean; stats: PeriodeStats }) {
  const { jaarRendement, positieRendementen } = stats
  const isPos = jaarRendement.rendementEuro >= 0
  const waardestijging = jaarRendement.eindWaarde - jaarRendement.beginWaarde

  const opbouwData = useMemo(
    () => stats.cumulatieveTwr.map(p => ({
      label: `${MAANDEN[p.month]} '${String(p.year).slice(2)}`,
      cumPct: parseFloat(p.cumPct.toFixed(2)),
    })),
    [stats.cumulatieveTwr],
  )

  // Grootste bijdrage aan het verschil met de benchmark: de positie met de grootste
  // €-bijdrage aan het totale koersrendement (zie calcPositieRendementen).
  const grootsteBijdrager = positieRendementen[0] ?? null

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* ── Header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-50 dark:border-gray-700/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            {titel}
          </h3>
          <div className="text-right">
            <p className={`text-2xl font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
              {formatEuro(jaarRendement.rendementEuro)}
            </p>
            <p className={`text-sm tabular-nums ${isPos ? 'text-green-500' : 'text-red-400'}`}>
              {pctLabel(jaarRendement.rendementPct)} <span className="text-gray-400">(TWR)</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Begin → stijging → eind ── */}
      <div className="px-5 py-3 border-b border-gray-50 dark:border-gray-700/50 flex items-center justify-center gap-2 flex-wrap text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {isAllTime ? 'Begin' : 'Begin jaar'} <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{formatEuro(jaarRendement.beginWaarde)}</span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">→</span>
        <span className={isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}>
          Waardestijging <span className="font-semibold tabular-nums">{formatEuro(waardestijging)}</span>
        </span>
        <span className="text-gray-300 dark:text-gray-600">→</span>
        <span className="text-gray-500 dark:text-gray-400">
          {isAllTime ? 'Nu' : 'Eind jaar'} <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{formatEuro(jaarRendement.eindWaarde)}</span>
        </span>
      </div>

      {/* ── Opbouw ── */}
      {opbouwData.length > 1 && (
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700/50">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
            Opbouw rendement
          </p>
          <OpbouwChart data={opbouwData} />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Je rendement bouwt maand voor maand op: elk punt is het geketende rendement tot en met die maand
            (time-weighted return, dus los van wanneer je bijstortte). Het laatste punt is je {isAllTime ? 'totaalrendement' : 'jaarrendement'}.
          </p>
        </div>
      )}

      {/* ── Bijdrage-uitsplitsing ── */}
      <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700/50">
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
          Inleg vs. koersrendement
        </p>
        <BijdrageBar nettoInleg={jaarRendement.nettoInleg} koersrendement={jaarRendement.rendementEuro} />
      </div>

      {/* ── Benchmark ── */}
      {stats.benchmarkPct != null && (
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700/50">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">
            Vergelijking met de S&amp;P500-index
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Vergelijkt het rendement van je hele portefeuille met dat van alleen de S&amp;P500-index (VUSA) over
            dezelfde periode, zodat je ziet of je eigen keuzes de markt versloegen.
          </p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-xs text-gray-400">Jouw portefeuille (TWR)</p>
              <p className={`text-lg font-bold tabular-nums ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {pctLabel(jaarRendement.rendementPct)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">S&amp;P500-index (benchmark)</p>
              <p className={`text-lg font-bold tabular-nums ${stats.benchmarkPct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatPct(stats.benchmarkPct, 1)}
              </p>
            </div>
          </div>
          {grootsteBijdrager && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
              Grootste bijdrage aan het verschil: <span className="font-medium text-gray-600 dark:text-gray-300">
                {KORTE_NAAM[grootsteBijdrager.isin] ?? grootsteBijdrager.product}
              </span> ({pctLabel(grootsteBijdrager.rendementPct, 1)})
            </p>
          )}
        </div>
      )}

      {/* ── Per-position return ── */}
      {positieRendementen.length > 0 && (
        <div className="px-5 py-4 border-b border-gray-50 dark:border-gray-700/50">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
            Rendement per aandeel
          </p>
          {positieRendementen.map(p => (
            <PositieRegel
              key={p.isin}
              p={p}
              bijdragePct={jaarRendement.rendementEuro !== 0 ? (p.rendementEuro / jaarRendement.rendementEuro) * 100 : null}
            />
          ))}
        </div>
      )}

      {/* ── Maand highlights + kosten ── */}
      <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {jaarRendement.besteMaand && (
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Beste maand</p>
            <p className="font-semibold text-green-700 dark:text-green-300 text-sm">{maandJaarLabel(jaarRendement.besteMaand.year, jaarRendement.besteMaand.month)}</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400 tabular-nums">{formatPct(jaarRendement.besteMaand.pct, 1)}</p>
          </div>
        )}
        {jaarRendement.slechtsteMaand && (
          <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">Slechtste maand</p>
            <p className="font-semibold text-red-700 dark:text-red-300 text-sm">{maandJaarLabel(jaarRendement.slechtsteMaand.year, jaarRendement.slechtsteMaand.month)}</p>
            <p className="text-sm font-bold text-red-500 dark:text-red-400 tabular-nums">{formatPct(jaarRendement.slechtsteMaand.pct, 1)}</p>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3">
          <p className="text-xs text-gray-400 font-medium">Transactiekosten</p>
          <p className="font-semibold text-gray-700 dark:text-gray-200 text-sm tabular-nums">{formatEuro(jaarRendement.totaalKosten)}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function Logboek({ transactions, manualEntries, koersHistorie, koersen }: Props) {
  const years = useMemo(() => getYears(transactions, manualEntries), [transactions, manualEntries])
  const [storedPeriode, setStoredPeriode] = useLocalStorage<Periode | null>(PERIODE_KEY, null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  const periode: Periode = storedPeriode === 'all-time'
    ? 'all-time'
    : (typeof storedPeriode === 'number' && years.includes(storedPeriode))
      ? storedPeriode
      : (years[years.length - 1] ?? new Date().getFullYear())

  function kiesPeriode(p: Periode) {
    setStoredPeriode(p)
    setSelectedMonth(null)
  }

  const alleMaandenData = useMemo(
    () => calcAlleMaandenData(transactions, koersHistorie, koersen),
    [transactions, koersHistorie, koersen],
  )

  const maandDataJaar: Record<number, MaandData> | null = useMemo(() => {
    if (typeof periode !== 'number') return null
    return calcMaandData(transactions, periode, koersHistorie, koersen)
  }, [transactions, periode, koersHistorie, koersen])

  const periodePunten: MaandDataPunt[] = useMemo(() => {
    if (periode === 'all-time') return alleMaandenData
    return maandDataJaar ? naarMaandPunten(maandDataJaar, periode) : []
  }, [periode, alleMaandenData, maandDataJaar])

  const periodeStats = useMemo((): PeriodeStats | null => {
    const overzicht = calcPeriodeOverzicht(periodePunten)
    if (!overzicht) return null
    const cumulatieveTwr = calcCumulatieveTwr(periodePunten)
    const benchmarkPct = calcBenchmarkRendement(koersHistorie, VUSA_ISIN, periodePunten)
    return { jaarRendement: overzicht.rendement, positieRendementen: overzicht.posities, cumulatieveTwr, benchmarkPct }
  }, [periodePunten, koersHistorie])

  const perJaarSamenvatting = useMemo(() => {
    if (periode !== 'all-time') return []
    return years.map(y => ({
      year: y,
      rendement: calcPeriodeRendement(alleMaandenData.filter(p => p.year === y)),
    }))
  }, [periode, years, alleMaandenData])

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
      {/* Periodekiezer */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
          {periode === 'all-time' ? 'All-time' : periode}
        </h2>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {years.map(y => (
            <button
              key={y}
              onClick={() => kiesPeriode(y)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors min-h-[44px] ${
                periode === y
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
              }`}
            >
              {y}
            </button>
          ))}
          <button
            onClick={() => kiesPeriode('all-time')}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors min-h-[44px] ${
              periode === 'all-time'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-300'
            }`}
          >
            All-time
          </button>
        </div>
      </div>

      {/* Maandtegels (los jaar) of per-jaar samenvatting (all-time) */}
      {periode === 'all-time' ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-50 dark:divide-gray-700/50 overflow-hidden">
          {perJaarSamenvatting.map(({ year: y, rendement }) => (
            <JaarRegel key={y} year={y} rendement={rendement} onClick={() => kiesPeriode(y)} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, m) => (
            <MonthTile
              key={m}
              maand={m}
              data={maandDataJaar![m]}
              isSelected={selectedMonth === m}
              onClick={() => {
                if (!maandDataJaar![m].hasPosities) return
                setSelectedMonth(prev => prev === m ? null : m)
              }}
            />
          ))}
        </div>
      )}

      {/* Overzichtkaart */}
      {periodeStats && (
        <OverzichtKaart
          titel={periode === 'all-time' ? 'All-time overzicht' : `Jaaroverzicht ${periode}`}
          isAllTime={periode === 'all-time'}
          stats={periodeStats}
        />
      )}

      {/* Detail panel (alleen bij een los jaar) */}
      {periode !== 'all-time' && selectedMonth !== null && maandDataJaar?.[selectedMonth] && (
        <DetailPanel maand={selectedMonth} year={periode} data={maandDataJaar[selectedMonth]} onClose={() => setSelectedMonth(null)} />
      )}
    </div>
  )
}
