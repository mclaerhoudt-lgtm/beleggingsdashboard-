import { useMemo } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { MetricCard } from '../ui/MetricCard'
import { SliderInput } from '../ui/SliderInput'
import { GrowthChart } from '../charts/GrowthChart'
import { ReturnChart } from '../charts/ReturnChart'
import { formatEuro, formatPct, formatDatumKort, formatDagKort, MAANDEN } from '../../utils/formatters'
import {
  calcPortfolioHistorie, calcPortfolioHistorieDagelijks, downsampleBehoudExtremen, calcReeel, KORTE_NAAM,
} from '../../utils/calculations'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import type { Settings, Transaction, AccountEvent, ManualEntry, Position, KoersHistorie, KoersCache } from '../../types'
import { COLORS } from '../../theme'

const VERBERG_KEY = 'bdash_verberg_bedragen'
const MASKER = '€ ••••••'

// Per-ISIN dot colour (brand palette)
const ISIN_KLEUR: Record<string, string> = {
  'IE00B3XXRP09': COLORS.primary,
  'NL0010273215': COLORS.secondary,
}
const FALLBACK_KLEUR = COLORS.axisMuted

// ─── Periodekiezer voor de portefeuillegroei-grafiek ──────────────────────────

type GroeiPeriode = 'maand' | 'ytd' | 'jaar' | '5jaar' | 'alles'
const PERIODE_KEY = 'bdash_overzicht_periode'
// Boven dit aantal punten dunnen we uit (met behoud van de extremen) — anders
// wordt de "5 jaar"/"Alles"-weergave (~1.260 dagpunten) traag op mobiel.
const MAX_GRAFIEK_PUNTEN = 350

const PERIODES: Array<{ id: GroeiPeriode; label: string }> = [
  { id: 'maand', label: 'Maand' },
  { id: 'ytd',   label: 'YTD' },
  { id: 'jaar',  label: 'Jaar' },
  { id: '5jaar', label: '5 jaar' },
  { id: 'alles', label: 'Alles' },
]

function dagKeyVanDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Vroegste dag die nog in de gekozen periode valt. 'alles' heeft geen
// ondergrens — toont de volledige beschikbare reeks vanaf de eerste transactie.
function periodeStartDag(periode: GroeiPeriode): string | null {
  const nu = new Date()
  switch (periode) {
    case 'maand': { const d = new Date(nu); d.setDate(d.getDate() - 30); return dagKeyVanDate(d) }
    case 'ytd':   return `${nu.getFullYear()}-01-01`
    case 'jaar':  { const d = new Date(nu); d.setDate(d.getDate() - 365); return dagKeyVanDate(d) }
    case '5jaar': { const d = new Date(nu); d.setDate(d.getDate() - 5 * 365); return dagKeyVanDate(d) }
    case 'alles': return null
  }
}

interface Props {
  portfolioValue: number
  totaalIngelegd: number
  rendement: number
  rendementPct: number
  eersteJaar: number
  laatsteDatum: Date | null
  settings: Settings
  onSettingsChange: (s: Settings) => void
  transactions: Transaction[]
  accountEvents: AccountEvent[]
  manualEntries: ManualEntry[]
  positions: Position[]
  koersHistorie: KoersHistorie
  koersHistorieDagelijks: KoersHistorie
  koersen: KoersCache
  loading: boolean
}

// ─── Sub-breakdown rows used inside the expanded metric cards ─────────────────

function BreakdownRij({ isin, naam, bedrag, pct, sub, verborgen }: {
  isin: string; naam: string; bedrag: number; pct: number; sub?: string; verborgen?: boolean
}) {
  const kleur = ISIN_KLEUR[isin] ?? FALLBACK_KLEUR
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: kleur }} />
        <span className="truncate text-gray-600 dark:text-gray-400">{naam}</span>
        <span className="ml-auto tabular-nums text-gray-700 dark:text-gray-300 shrink-0">{verborgen ? MASKER : formatEuro(bedrag)}</span>
        <span className="tabular-nums text-gray-400 w-9 text-right shrink-0">{pct.toFixed(0)}%</span>
      </div>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 pl-3.5">{sub}</p>}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Overzicht({
  portfolioValue, totaalIngelegd, rendement, rendementPct, eersteJaar, laatsteDatum,
  settings, onSettingsChange, transactions, manualEntries, positions,
  koersHistorie, koersHistorieDagelijks, koersen, loading,
}: Props) {
  const reeel  = calcReeel(portfolioValue, settings.inflatie, new Date().getFullYear(), eersteJaar)
  const isPos  = rendement >= 0

  // Verbergt de euro-bedragen (privacy, bv. als iemand meekijkt) — percentages
  // blijven altijd zichtbaar. Keuze overleeft een herlaad/tab-wissel via localStorage.
  const [verborgen, setVerborgen] = useLocalStorage<boolean>(VERBERG_KEY, false)
  const toon = (bedrag: number) => verborgen ? MASKER : formatEuro(bedrag)

  // Maand-gebaseerd (ongewijzigde methode) — voedt alleen "Rendement per maand"
  // hieronder. De portefeuillegroei-grafiek gebruikt de fijnmazige dagreeks.
  const historie = useMemo(
    () => calcPortfolioHistorie(transactions, koersHistorie, koersen),
    [transactions, koersHistorie, koersen],
  )

  // Periodekiezer voor de groei-grafiek (Maand/YTD/Jaar/5 jaar/Alles) — keuze
  // blijft bewaard na herladen/tab-wissel.
  const [periode, setPeriode] = useLocalStorage<GroeiPeriode>(PERIODE_KEY, '5jaar')

  const dagHistorie = useMemo(
    () => calcPortfolioHistorieDagelijks(transactions, koersHistorieDagelijks, koersen),
    [transactions, koersHistorieDagelijks, koersen],
  )

  const gefilterdeDagHistorie = useMemo(() => {
    const startDag = periodeStartDag(periode)
    return startDag ? dagHistorie.filter(d => d.datum >= startDag) : dagHistorie
  }, [dagHistorie, periode])

  // Lange periodes (5 jaar/Alles) dunnen we uit met behoud van de extremen,
  // zodat de lijn vloeiend blijft op mobiel zonder de piek weg te middelen.
  const gedownsampledeDagHistorie = useMemo(
    () => downsampleBehoudExtremen(gefilterdeDagHistorie, MAX_GRAFIEK_PUNTEN, p => p.waarde),
    [gefilterdeDagHistorie],
  )

  const growthData = useMemo(() => gedownsampledeDagHistorie.map(d => ({
    label:    formatDagKort(d.datum),
    waarde:   d.waarde,
    ingelegd: d.ingelegd,
    reeel:    calcReeel(d.waarde, settings.inflatie, parseInt(d.datum.slice(0, 4), 10), eersteJaar),
  })), [gedownsampledeDagHistorie, settings.inflatie, eersteJaar])

  const returnData = useMemo(() => historie
    .filter((d): d is typeof d & { rendementPct: number } => d.rendementEuro !== 0 && d.rendementPct != null)
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
          sub:    `${p.aantal % 1 === 0 ? p.aantal : p.aantal.toFixed(4)}× @ gem. ${verborgen ? MASKER : formatEuro(p.gemAankoopprijs)}`,
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
  }, [positions, totaalIngelegd, transactions, verborgen])

  const isEmpty = transactions.length === 0 && manualEntries.length === 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        {laatsteDatum ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Data bijgewerkt t/m <span className="font-medium text-gray-500 dark:text-gray-400">{formatDatumKort(laatsteDatum)}</span>
          </p>
        ) : <span />}
        <button
          onClick={() => setVerborgen(v => !v)}
          title={verborgen ? 'Toon bedragen' : 'Verberg bedragen'}
          aria-label={verborgen ? 'Toon bedragen' : 'Verberg bedragen'}
          className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
        >
          {verborgen ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>

      {/* Metric cards — first two have expandable position breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* Portefeuillewaarde with position breakdown */}
        <MetricCard label="Huidige waarde" value={toon(portfolioValue)} loading={loading}>
          {waardeRijen.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {waardeRijen.map(r => (
                <BreakdownRij key={r.isin} {...r} verborgen={verborgen} />
              ))}
            </div>
          )}
        </MetricCard>

        {/* Totaal ingelegd with per-positie breakdown */}
        <MetricCard label="Totaal ingelegd" value={toon(totaalIngelegd)}>
          {ingelegdRijen.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 space-y-1.5">
              {ingelegdRijen.map(r => (
                <BreakdownRij key={r.isin} {...r} sub={r.sub} verborgen={verborgen} />
              ))}
            </div>
          )}
        </MetricCard>

        <MetricCard
          label="Rendement"
          value={toon(rendement)}
          sub={formatPct(rendementPct)}
          positive={isPos}
        />
        <MetricCard
          label="Reëel (na inflatie)"
          value={toon(reeel)}
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
              <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                <h2 className="text-base font-semibold text-gray-700 dark:text-gray-200">Portefeuillegroei</h2>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                  {PERIODES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPeriode(p.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors min-h-[32px] ${
                        periode === p.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Je portefeuillewaarde per handelsdag (holdings × dag-slotkoers), naast je totale inleg en de reële waarde na
                inflatie. Het laatste punt (vandaag) is gebaseerd op de live koers.
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
