import { useState, useMemo, useCallback, useEffect } from 'react'
import { SliderInput } from '../ui/SliderInput'
import { MetricCard } from '../ui/MetricCard'
import { FutureChart } from '../charts/FutureChart'
import { formatEuro, formatPct } from '../../utils/formatters'
import { calcToekomst } from '../../utils/calculations'
import { CHART_COLORS } from '../charts/FutureChart'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import type { ToekomstParams, ToekomstPunt, VerhoogMoment } from '../../types'
import toast from 'react-hot-toast'

const DEFAULT_TOEKOMST_PARAMS: Omit<ToekomstParams, 'startkapitaal'> = {
  inlegFase1:      150,
  kostenFase1:     3,
  looptijd:        30,
  verhoogmomenten: [],
  rendementPct:    9,
  inflatiePct:     2.5,
  box3Mode:        'geen',
  box3Tarief:      36,
  hvv:             59357,
  hvr:             1800,
}

const STORAGE_KEY = 'bdash_toekomst_settings'

const PRESETS = [
  { label: 'Conservatief 5%', value: 5 },
  { label: 'S&P500 9%', value: 9 },
  { label: 'Optimistisch 12%', value: 12 },
]

const BOX3_TABS = [
  { key: 'geen', label: 'Geen belasting' },
  { key: 'oud', label: 'Huidig box 3' },
  { key: 'nieuw', label: 'Nieuw 2028' },
] as const

const FASE_COLORS = [
  { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-700', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-700', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
  { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-700', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
]

interface Props {
  initialRendement?: number | null
  portfolioValue?: number
}

function getInitialStartkapitaal(portfolioValue?: number): number {
  if (portfolioValue && portfolioValue > 0 && portfolioValue <= 25000) {
    return Math.round(portfolioValue / 250) * 250
  }
  return 3026
}

// ─── InlegFase card ───────────────────────────────────────────────────────────

function InlegFaseKaart({ index, bedrag, kosten, onChange }: {
  index: number; bedrag: number; kosten: number
  onChange: (u: { bedrag?: number; kosten?: number }) => void
}) {
  const netto = bedrag - kosten
  const pct   = bedrag > 0 ? (kosten / bedrag) * 100 : 0
  const c     = FASE_COLORS[index % FASE_COLORS.length]
  return (
    <div className={`rounded-xl p-3 border ${c.bg} ${c.border} space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${c.dot}`} />
          <span className={`text-xs font-semibold ${c.text}`}>Fase {index + 1}</span>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Netto: <span className="font-medium tabular-nums">{formatEuro(netto)}/mnd</span>
        </span>
      </div>
      <SliderInput label="Maandelijkse inleg" value={bedrag} min={0} max={2000} step={25}
        format={v => formatEuro(v)} onChange={v => onChange({ bedrag: v })} />
      <SliderInput label="Transactiekosten/mnd" value={kosten} min={0} max={10} step={0.5}
        format={v => formatEuro(v)} onChange={v => onChange({ kosten: v })} />
      <div className="flex justify-between text-xs pt-1 border-t border-current/10">
        <span className={c.text}>Netto: <span className="font-semibold tabular-nums">{formatEuro(netto)}/mnd</span></span>
        <span className="text-gray-400 tabular-nums">Kosten: {pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// ─── Timeline ────────────────────────────────────────────────────────────────

interface Fase { index: number; startJaar: number; eindJaar: number; bedrag: number; kosten: number }

function FaseTijdlijn({ fases, looptijd }: { fases: Fase[]; looptijd: number }) {
  if (fases.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className="flex gap-px rounded-xl overflow-hidden h-10">
        {fases.map(fase => {
          const duur = fase.eindJaar - fase.startJaar
          const pct  = Math.max((duur / looptijd) * 100, 4)
          const c    = FASE_COLORS[fase.index % FASE_COLORS.length]
          const netto = fase.bedrag - fase.kosten
          return (
            <div key={fase.index} style={{ width: `${pct}%` }}
              className={`${c.bg} border ${c.border} flex flex-col justify-center px-2 min-w-0 overflow-hidden`}>
              <p className={`text-xs font-semibold ${c.text} truncate`}>Fase {fase.index + 1}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums truncate">
                {formatEuro(netto)}/mnd · {duur}jr
              </p>
            </div>
          )
        })}
      </div>
      <div className="flex text-xs text-gray-400">
        {fases.map((fase, i) => {
          const duur = fase.eindJaar - fase.startJaar
          const pct  = Math.max((duur / looptijd) * 100, 4)
          return (
            <div key={i} style={{ width: `${pct}%` }}>
              <span className="tabular-nums">{fase.startJaar}</span>
            </div>
          )
        })}
        <span className="ml-auto tabular-nums">{looptijd}</span>
      </div>
    </div>
  )
}

// ─── Detail panel ────────────────────────────────────────────────────────────

function DetailPanel({ punt, data, params, onClose, onNav }: {
  punt: ToekomstPunt
  data: ToekomstPunt[]
  params: ToekomstParams
  onClose: () => void
  onNav: (label: string) => void
}) {
  const idx      = data.findIndex(d => d.label === punt.label)
  const prevPunt = idx > 0 ? data[idx - 1] : null
  const nextPunt = idx < data.length - 1 ? data[idx + 1] : null
  const rendement = punt.nominaal - params.startkapitaal - punt.ingelegd

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-blue-200 dark:border-blue-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800">
        <p className="font-semibold text-blue-700 dark:text-blue-300">📅 {punt.label} — detail</p>
        <button onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg font-medium w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          ×
        </button>
      </div>

      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        {/* Waarden */}
        <div className="space-y-2">
          <Row label="Nominale waarde"     value={formatEuro(punt.nominaal)} highlight />
          <Row label="Na box 3 belasting"  value={formatEuro(punt.naBox3)} />
          <Row label="Reële koopkracht"    value={formatEuro(punt.reeel)} />
        </div>

        {/* Rendement + inleg */}
        <div className="space-y-2">
          <Row label="Ingelegd t/m nu"     value={formatEuro(punt.ingelegd + params.startkapitaal)} />
          <Row label="Rendement t/m nu"
            value={`${formatEuro(rendement)} (${formatPct(punt.nominaal > 0 ? (rendement / (params.startkapitaal + punt.ingelegd)) * 100 : 0, 1)})`}
            positive={rendement >= 0}
          />
          <Row label="Transactiekosten t/m nu" value={formatEuro(punt.totaleKosten)} />
        </div>

        {/* Belasting */}
        {punt.cumulatieveBelasting > 0 && (
          <div className="space-y-2">
            <Row label="Belasting dit jaar"    value={formatEuro(punt.jaarBelasting)} warn />
            <Row label="Cumulatief belasting"  value={formatEuro(punt.cumulatieveBelasting)} warn />
          </div>
        )}

        {/* Inleg info */}
        <div className="space-y-2">
          <Row label="Maandelijkse inleg"
            value={`${formatEuro(punt.maandInleg)}/mnd (fase ${punt.faseIndex + 1})`}
          />
          <Row label="Geconfigureerd rendement" value={`${params.rendementPct}%/jaar`} />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => prevPunt && onNav(prevPunt.label)}
          disabled={!prevPunt}
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline">
          ← {prevPunt?.label ?? ''}
        </button>
        <span className="text-xs text-gray-400">{idx + 1} / {data.length}</span>
        <button
          onClick={() => nextPunt && onNav(nextPunt.label)}
          disabled={!nextPunt}
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline">
          {nextPunt?.label ?? ''} →
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, highlight, positive, warn }: {
  label: string; value: string; highlight?: boolean; positive?: boolean; warn?: boolean
}) {
  const valueClass = warn
    ? 'text-orange-500 dark:text-orange-400'
    : positive === true
    ? 'text-green-600 dark:text-green-400'
    : positive === false
    ? 'text-red-500 dark:text-red-400'
    : highlight
    ? 'text-gray-900 dark:text-white font-bold'
    : 'text-gray-700 dark:text-gray-300'
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`tabular-nums text-right ${valueClass}`}>{value}</span>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Toekomst({ initialRendement, portfolioValue }: Props) {
  // Persisted in localStorage — survives tab switches
  const [params, setParams] = useLocalStorage<ToekomstParams>(
    STORAGE_KEY,
    { ...DEFAULT_TOEKOMST_PARAMS, startkapitaal: getInitialStartkapitaal(portfolioValue) },
  )
  const [selectedYear, setSelectedYear] = useState<string | null>(null)

  useEffect(() => {
    if (initialRendement == null) return
    setParams(p => ({ ...p, rendementPct: initialRendement }))
    toast.success(`Rendement ingesteld op ${initialRendement.toFixed(1)}% (historisch VUSA.AS)`)
  }, [initialRendement])

  const set = useCallback(<K extends keyof ToekomstParams>(k: K, v: ToekomstParams[K]) => {
    setParams(p => ({ ...p, [k]: v }))
  }, [])

  function resetToDefault() {
    setParams({ ...DEFAULT_TOEKOMST_PARAMS, startkapitaal: getInitialStartkapitaal(portfolioValue) })
    setSelectedYear(null)
    toast.success('Instellingen teruggezet naar standaard')
  }

  const data = useMemo(() => calcToekomst(params), [params])
  const lastPunt = data[data.length - 1]
  const selectedPunt = selectedYear ? data.find(d => d.label === selectedYear) ?? null : null

  const fases: Fase[] = useMemo(() => {
    const sorted = [...params.verhoogmomenten].sort((a, b) => a.jaar - b.jaar)
    const result: Fase[] = [
      { index: 0, startJaar: 0, eindJaar: sorted[0]?.jaar ?? params.looptijd, bedrag: params.inlegFase1, kosten: params.kostenFase1 },
    ]
    sorted.forEach((m, i) => {
      result.push({ index: i + 1, startJaar: m.jaar, eindJaar: sorted[i + 1]?.jaar ?? params.looptijd, bedrag: m.bedrag, kosten: m.kosten })
    })
    return result
  }, [params])

  const mijlpalen = useMemo(() => {
    const jaren = [10, 20, 30, params.looptijd].filter((v, i, a) => a.indexOf(v) === i && v <= params.looptijd)
    return jaren.map(j => data[j - 1]).filter(Boolean)
  }, [data, params.looptijd])

  function addVerhoogmoment() {
    const lastM = params.verhoogmomenten.at(-1)
    set('verhoogmomenten', [...params.verhoogmomenten, {
      jaar:   Math.min(params.looptijd, (lastM?.jaar ?? 0) + 5),
      bedrag: (lastM?.bedrag ?? params.inlegFase1) + 50,
      kosten: lastM?.kosten ?? params.kostenFase1,
    }])
  }

  function removeVerhoogmoment(i: number) {
    set('verhoogmomenten', params.verhoogmomenten.filter((_, idx) => idx !== i))
  }

  function updateVerhoogmoment(i: number, updates: Partial<VerhoogMoment>) {
    set('verhoogmomenten', params.verhoogmomenten.map((m, idx) => idx === i ? { ...m, ...updates } : m))
  }

  function shareScenario() {
    const urlParams = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => urlParams.set(k, k === 'verhoogmomenten' ? JSON.stringify(v) : String(v)))
    const url = `${window.location.origin}${window.location.pathname}?tab=toekomst&${urlParams}`
    navigator.clipboard.writeText(url).then(() => toast.success('Link gekopieerd!')).catch(() => toast.error('Kopiëren mislukt'))
  }

  return (
    <div className="space-y-6">
      {/* Summary metric cards — colours match the chart lines */}
      {lastPunt && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard label={`Nominaal (jr ${params.looptijd})`} value={formatEuro(lastPunt.nominaal)} color={CHART_COLORS.nominaal} />
          <MetricCard label={`Na box 3 (jr ${params.looptijd})`} value={formatEuro(lastPunt.naBox3)} color={CHART_COLORS.naBox3} />
          <MetricCard label={`Reëel (jr ${params.looptijd})`} value={formatEuro(lastPunt.reeel)} color={CHART_COLORS.reeel} />
          <MetricCard label="Totaal ingelegd" value={formatEuro(lastPunt.ingelegd)} color={CHART_COLORS.ingelegd} />
          <MetricCard label="Betaalde kosten" value={formatEuro(lastPunt.totaleKosten)} color={CHART_COLORS.ingelegd} />
        </div>
      )}

      {/* Milestone row */}
      {mijlpalen.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {mijlpalen.map(p => (
            <div key={p.jaar} className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700 text-center">
              <p className="text-xs text-gray-400 mb-1">Jaar {p.jaar}</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{formatEuro(p.nominaal)}</p>
              <p className="text-xs text-green-600 dark:text-green-400 tabular-nums">Reëel: {formatEuro(p.reeel)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Left panel: basis + inlegfases ─── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Basis */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-5">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Basis</h3>
            <SliderInput label="Startkapitaal" value={params.startkapitaal} min={0} max={25000} step={250}
              format={v => formatEuro(v)} onChange={v => set('startkapitaal', v)} />
            <SliderInput label="Looptijd" value={params.looptijd} min={1} max={50} step={1}
              format={v => `${v} jaar`} onChange={v => set('looptijd', v)} />
          </div>

          {/* Inleg per fase */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Inleg per fase</h3>
              {params.verhoogmomenten.length < 3 && (
                <button onClick={addVerhoogmoment} className="text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline">
                  + Fase
                </button>
              )}
            </div>

            <InlegFaseKaart index={0} bedrag={params.inlegFase1} kosten={params.kostenFase1}
              onChange={u => setParams(p => ({ ...p, inlegFase1: u.bedrag ?? p.inlegFase1, kostenFase1: u.kosten ?? p.kostenFase1 }))} />

            {params.verhoogmomenten.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400">Vanaf jaar</label>
                  <input type="number" min={1} max={params.looptijd} value={m.jaar}
                    onChange={e => updateVerhoogmoment(i, { jaar: parseInt(e.target.value) || 1 })}
                    className="w-20 px-2 py-1 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200" />
                  <button onClick={() => removeVerhoogmoment(i)} className="ml-auto text-xs text-red-400 hover:text-red-600">Verwijder</button>
                </div>
                <InlegFaseKaart index={i + 1} bedrag={m.bedrag} kosten={m.kosten}
                  onChange={u => updateVerhoogmoment(i, u)} />
              </div>
            ))}

            {fases.length > 0 && <div className="pt-2"><FaseTijdlijn fases={fases} looptijd={params.looptijd} /></div>}
          </div>

          {/* Rendement presets (stay in left panel per spec) */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Rendement preset</p>
            <div className="flex gap-2 flex-wrap">
              {PRESETS.map(p => (
                <button key={p.value} onClick={() => set('rendementPct', p.value)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors flex-1 ${
                    params.rendementPct === p.value
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-blue-300'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={resetToDefault}
              className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm transition-colors min-h-[44px]">
              Reset standaard
            </button>
            <button onClick={shareScenario}
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors min-h-[44px]">
              Deel scenario
            </button>
          </div>
        </div>

        {/* ─── Right panel: chart + detail + sliders ─── */}
        <div className="lg:col-span-2 space-y-4">

          {/* CHART */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Prognose</h3>
              {!selectedYear && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Klik op een jaar voor details</p>
              )}
            </div>
            <FutureChart
              data={data}
              verhoogmomenten={params.verhoogmomenten}
              selectedYear={selectedYear}
              onYearClick={setSelectedYear}
            />
          </div>

          {/* DETAIL PANEL (replaces placeholder when year selected) */}
          {selectedPunt ? (
            <DetailPanel
              punt={selectedPunt}
              data={data}
              params={params}
              onClose={() => setSelectedYear(null)}
              onNav={setSelectedYear}
            />
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
              <p className="text-gray-400 dark:text-gray-500 text-sm">
                Klik op een jaar in de grafiek om het detail-overzicht te zien
              </p>
            </div>
          )}

          {/* SLIDERS BELOW CHART */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-5">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Rendement & inflatie</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <SliderInput label="Rendement %" value={params.rendementPct} min={0} max={20} step={0.5}
                onChange={v => set('rendementPct', v)} />
              <SliderInput label="Inflatie %" value={params.inflatiePct} min={0} max={10} step={0.1}
                onChange={v => set('inflatiePct', v)} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700 space-y-4">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Belasting (box 3)</h3>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl">
              {BOX3_TABS.map(tab => (
                <button key={tab.key} onClick={() => set('box3Mode', tab.key)}
                  className={`flex-1 py-2 px-1.5 rounded-lg text-xs font-medium transition-colors ${
                    params.box3Mode === tab.key
                      ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>
            {params.box3Mode !== 'geen' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <SliderInput label="Belastingtarief" value={params.box3Tarief} min={20} max={50} step={1}
                  onChange={v => set('box3Tarief', v)} />
                {params.box3Mode === 'oud' && (
                  <SliderInput label="Heffingsvrij vermogen" value={params.hvv} min={0} max={100000} step={1000}
                    format={v => formatEuro(v)} onChange={v => set('hvv', v)} />
                )}
                {params.box3Mode === 'nieuw' && (
                  <SliderInput label="Heffingsvrij rendement" value={params.hvr} min={0} max={5000} step={100}
                    format={v => formatEuro(v)} onChange={v => set('hvr', v)} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
