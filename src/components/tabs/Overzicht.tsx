import { useMemo } from 'react'
import { MetricCard } from '../ui/MetricCard'
import { SliderInput } from '../ui/SliderInput'
import { GrowthChart } from '../charts/GrowthChart'
import { ReturnChart } from '../charts/ReturnChart'
import { formatEuro, formatPct, MAANDEN } from '../../utils/formatters'
import { calcPortfolioHistorie, calcReeel, KORTE_NAAM } from '../../utils/calculations'
import type { Settings, Transaction, AccountEvent, ManualEntry, Position, KoersHistorie, KoersCache } from '../../types'
import { COLORS } from '../../theme'

// Per-ISIN dot colour (brand palette)
const ISIN_KLEUR: Record<string, string> = {
  'IE00B3XXRP09': COLORS.primary,
  'NL0010273215': COLORS.secondary,
}
const FALLBACK_KLEUR = COLORS.axisMuted

interface Props {
  portfolioValue: number
  totaalIngelegd: number
  rendement: number
  rendementPct: number
  eersteJaar: number
  settings: Settings
  onSettingsChange: (s: Settings) => void
  transactions: Transaction[]
  accountEvents: AccountEvent[]
  manualEntries: ManualEntry[]
  positions: Position[]
  koersHistorie: KoersHistorie
  koersen: KoersCache
  loading: boolean
}

// ─── Sub-breakdown rows used inside the expanded metric cards ─────────────────

function BreakdownRij({ isin, naam, bedrag, pct, sub }: {
  isin: string; naam: string; bedrag: number; pct: number; sub?: string
}) {
  const kleur = ISIN_KLEUR[isin] ?? FALLBACK_KLEUR
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: kleur }} />
        <span className="truncate text-gray-600 dark:text-gray-400">{naam}</span>
        <span className="ml-auto tabular-nums text-gray-700 dark:text-gray-300 shrink-0">{formatEuro(bedrag)}</span>
        <span className="tabular-nums text-gray-400 w-9 text-right shrink-0">{pct.toFixed(0)}%</span>
      </div>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 pl-3.5">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Overzicht({
  portfolioValue, totaalIngelegd, rendement, rendementPct, eersteJaar,
  settings, onSettingsChange, transactions, manualEntries, positions, koersHistorie, koersen, loading,
}: Props) {
  const reeel  = calcReeel(portfolioValue, settings.inflatie, new Date().getFullYear(), eersteJaar)
  const isPos  = rendement >= 0

  const historie = useMemo(
    () => calcPortfolioHistorie(transactions, koersHistorie, koersen),
    [transactions, koersHistorie, koersen],
  )
  const laatsteMaand = historie[historie.length - 1]

  const growthData = useMemo(() => historie.map(d => {
    const [y, m] = d.key.split('-')
    return {
      label:   `${MAANDEN[parseInt(m) - 1]} '${y.slice(2)}`,
      waarde:  d.waarde,
      ingelegd: d.ingelegd,
      reeel:   calcReeel(d.waarde, settings.inflatie, parseInt(y), eersteJaar),
    }
  }), [historie, settings.inflatie, eersteJaar])

  const returnData = useMemo(() => historie
    .filter(d => d.rendementEuro !== 0)
    .map(d => {
      const [y, m] = d.key.split('-')
      return { label: `${MAANDEN[parseInt(m) - 1]} '${y.slice(2)}`, rendement: parseFloat(d.rendementPct.toFixed(2)) }
    }), [historie])

  // Breakdown data for "Huidige waarde"
  const waardeRijen = useMemo(() =>
    positions
      .filter(p => p.waarde > 0)
      .map(p => ({
        isin:  p.isin,
        naam:  KORTE_NAAM[p.isin] ?? p.product.slice(0, 16),
        bedrag: p.waarde,
        pct:   portfolioValue > 0 ? (p.waarde / portfolioValue) * 100 : 0,
      })),
    [positions, portfolioValue],
  )

  // Breakdown data for "Totaal ingelegd"
  const ingelegdRijen = useMemo(() => {
    const perIsin = positions
      .filter(p => p.aantal > 0)
      .map(p => {
        const bedrag = p.aantal * p.gemAankoopprijs
        return {
          isin:   p.isin,
          naam:   KORTE_NAAM[p.isin] ?? p.product.slice(0, 16),
          bedrag,
          pct:    totaalIngelegd > 0 ? (bedrag / totaalIngelegd) * 100 : 0,
          sub:    `${p.aantal % 1 === 0 ? p.aantal : p.aantal.toFixed(4)}× @ gem. ${formatEuro(p.gemAankoopprijs)}`,
        }
      })
    const totalTransKosten = transactions.reduce((s, t) => s + t.transactiekosten, 0)
    if (totalTransKosten > 0) {
      perIsin.push({
        isin:   '__kosten__',
        naam:   'Transactiekosten',
        bedrag: totalTransKosten,
        pct:    totaalIngelegd > 0 ? (totalTransKosten / totaalIngelegd) * 100 : 0,
        sub:    '',
      })
    }
    return perIsin
  }, [positions, totaalIngelegd, transactions])

  const isEmpty = transactions.length === 0 && manualEntries.length === 0

  return (
    <div className="space-y-6">
      {/* Metric cards — first two have expandable position breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* Portefeuillewaarde with position breakdown */}
        <MetricCard label="Huidige waarde" value={formatEuro(portfolioValue)} loading={loading}>
          {waardeRijen.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {waardeRijen.map(r => (
                <BreakdownRij key={r.isin} {...r} />
              ))}
            </div>
          )}
        </MetricCard>

        {/* Totaal ingelegd with per-positie breakdown */}
        <MetricCard label="Totaal ingelegd" value={formatEuro(totaalIngelegd)}>
          {ingelegdRijen.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {ingelegdRijen.map(r => (
                <BreakdownRij key={r.isin} {...r} sub={r.sub} />
              ))}
            </div>
          )}
        </MetricCard>

        <MetricCard
          label="Rendement"
          value={formatEuro(rendement)}
          sub={formatPct(rendementPct)}
          positive={isPos}
        />
        <MetricCard
          label="Reëel (na inflatie)"
          value={formatEuro(reeel)}
          sub={`${settings.inflatie}% inflatie`}
        />
      </div>

      {/* Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-5">
        <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">Instellingen</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <SliderInput label="Inflatie" value={settings.inflatie} min={0} max={10} step={0.1} unit="%"
            onChange={v => onSettingsChange({ ...settings, inflatie: v })} />
          <SliderInput label="Transactiekosten" value={settings.transactiekosten} min={0} max={50} step={0.5} unit="€"
            format={v => `€${v.toFixed(2)}`}
            onChange={v => onSettingsChange({ ...settings, transactiekosten: v })} />
        </div>
      </div>

      {isEmpty ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 border border-gray-100 dark:border-gray-700 text-center">
          <p className="text-4xl mb-4">📊</p>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Nog geen data</h3>
          <p className="text-gray-500 dark:text-gray-400">
            Importeer je DEGIRO transacties of voeg handmatig een entry toe via het tabblad Import.
          </p>
        </div>
      ) : (
        <>
          {growthData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Portefeuillegroei</h2>
              <p className="text-xs text-gray-400 mb-4">
                Je portefeuillewaarde per maand (holdings × maand-eindkoers), naast je totale inleg en de reële waarde na inflatie.
                {laatsteMaand?.isSchatting && ' Het laatste punt is een tussentijdse schatting op basis van de live koers.'}
              </p>
              <GrowthChart data={growthData} />
            </div>
          )}
          {returnData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Rendement per maand</h2>
              <p className="text-xs text-gray-400 mb-4">
                Je koersrendement per maand in %, gecorrigeerd voor stortingen en verkopen — dus puur hoe je beleggingen bewogen, niet hoeveel je bijstortte.
              </p>
              <ReturnChart data={returnData} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
