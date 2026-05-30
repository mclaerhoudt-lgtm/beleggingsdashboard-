import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Tooltip,
} from 'recharts'
import { formatEuro } from '../../utils/formatters'
import type { ToekomstPunt, VerhoogMoment } from '../../types'

// ─── Brand colours (kept in sync with Toekomst MetricCards) ──────────────────
export const CHART_COLORS = {
  nominaal:  '#3266ad',
  naBox3:    '#d85a30',
  reeel:     '#1d9e75',
  ingelegd:  '#888780',
  belasting: '#d85a30',
}

// Phase background fills (rgba) and text colours
const FASE_BG    = ['#3266ad', '#1d9e75', '#7c3aed', '#d85a30']
const FASE_TEXT  = ['#3266ad', '#1d9e75', '#7c3aed', '#d85a30']

interface Props {
  data: ToekomstPunt[]
  verhoogmomenten?: VerhoogMoment[]
  selectedYear?: string | null
  onYearClick?: (label: string) => void
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  const visible = payload.filter(p =>
    !['totaleKosten', 'jaarBelasting'].includes(p.dataKey) && p.value > 0
  )
  const jaarBel = payload.find(p => p.dataKey === 'jaarBelasting')
  const cumBel  = payload.find(p => p.dataKey === 'cumulatieveBelasting')

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-xl text-sm min-w-[200px]">
      <p className="font-semibold text-white mb-2">{label}</p>
      {visible.map(e => (
        <div key={e.dataKey} className="flex justify-between gap-4 py-0.5">
          <span style={{ color: e.color }} className="truncate">{e.name}</span>
          <span className="text-white font-medium tabular-nums shrink-0">{formatEuro(e.value)}</span>
        </div>
      ))}
      {jaarBel && jaarBel.value > 0 && (
        <div className="mt-1.5 pt-1.5 border-t border-gray-700 space-y-0.5">
          <div className="flex justify-between gap-4">
            <span className="text-orange-400">Belasting dit jaar</span>
            <span className="text-orange-300 tabular-nums shrink-0">{formatEuro(jaarBel.value)}</span>
          </div>
          {cumBel && cumBel.value > 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-orange-400/70">Cumulatief</span>
              <span className="text-orange-300/70 tabular-nums shrink-0">{formatEuro(cumBel.value)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main chart ───────────────────────────────────────────────────────────────

export function FutureChart({ data, verhoogmomenten = [], selectedYear, onYearClick }: Props) {
  if (data.length === 0) return null

  const lastPunt    = data[data.length - 1]
  const hasTax      = lastPunt.cumulatieveBelasting > 0
  const showTaxAxis = lastPunt.cumulatieveBelasting > 1000

  // Extract netto maandInleg per faseIndex from data
  const faseInleg: Record<number, number> = {}
  for (const punt of data) {
    if (!(punt.faseIndex in faseInleg)) faseInleg[punt.faseIndex] = punt.maandInleg
  }

  // Build phase segments
  const sortedM = [...verhoogmomenten].sort((a, b) => a.jaar - b.jaar)
  const phases: Array<{ x1: string; x2: string; faseIdx: number }> = []
  let prevJaar = 1
  for (let i = 0; i <= sortedM.length; i++) {
    const endJaar = sortedM[i]?.jaar ?? lastPunt.jaar + 1
    if (prevJaar <= endJaar - 1) {
      phases.push({ x1: `Jaar ${prevJaar}`, x2: `Jaar ${endJaar - 1}`, faseIdx: i })
    }
    prevJaar = endJaar
  }

  return (
    <ResponsiveContainer width="100%" height={420}>
      <AreaChart
        data={data}
        margin={{ top: 24, right: showTaxAxis ? 60 : 16, left: 0, bottom: 0 }}
        onClick={(state) => {
          const label = state?.activeLabel
          if (typeof label === 'string') onYearClick?.(label)
        }}
        style={{ cursor: onYearClick ? 'pointer' : 'default' }}
      >
        <defs>
          <linearGradient id="gradNom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.nominaal} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.nominaal} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradBox3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.naBox3} stopOpacity={0.2} />
            <stop offset="95%" stopColor={CHART_COLORS.naBox3} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradReeel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={CHART_COLORS.reeel} stopOpacity={0.25} />
            <stop offset="95%" stopColor={CHART_COLORS.reeel} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

        {/* Fase background areas with labels */}
        {phases.map(ph => (
          <ReferenceArea
            key={ph.faseIdx}
            x1={ph.x1}
            x2={ph.x2}
            fill={FASE_BG[ph.faseIdx % FASE_BG.length]}
            fillOpacity={0.08}
            stroke="none"
            label={{
              value: `Fase ${ph.faseIdx + 1} · ${formatEuro(faseInleg[ph.faseIdx] ?? 0)}/mnd`,
              position: 'insideTopLeft',
              fontSize: 10,
              fill: FASE_TEXT[ph.faseIdx % FASE_TEXT.length],
              fontWeight: 600,
            }}
          />
        ))}

        {/* Transition lines with "↑ netto" labels */}
        {sortedM.map((m, i) => {
          const nextNetto = faseInleg[i + 1] ?? (m.bedrag - m.kosten)
          return (
            <ReferenceLine
              key={i}
              x={`Jaar ${m.jaar}`}
              stroke="rgba(255,255,255,0.3)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: `↑ ${formatEuro(nextNetto)}`,
                position: 'top',
                fontSize: 11,
                fill: FASE_TEXT[(i + 1) % FASE_TEXT.length],
                fontWeight: 600,
              }}
            />
          )
        })}

        {/* Selected year highlight */}
        {selectedYear && (
          <ReferenceLine
            x={selectedYear}
            stroke="#1f2937"
            strokeWidth={2}
            label={{ value: '▼', position: 'top', fontSize: 12, fill: '#1f2937' }}
          />
        )}

        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          yAxisId="left"
          tickFormatter={v => `€${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : Number(v)}`}
          tick={{ fontSize: 11 }}
          width={68}
        />
        {showTaxAxis && (
          <YAxis
            yAxisId="tax"
            orientation="right"
            tickFormatter={v => `€${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : Number(v)}`}
            tick={{ fontSize: 10 }}
            width={52}
          />
        )}

        <Tooltip content={<CustomTooltip />} />
        <Legend />

        {/* Hidden series carried for tooltip */}
        <Area yAxisId="left" type="monotone" dataKey="jaarBelasting" name="Belasting dit jaar" stroke="transparent" fill="transparent" legendType="none" />

        <Area yAxisId="left" type="monotone" dataKey="ingelegd"  name="Ingelegd"  stroke={CHART_COLORS.ingelegd} fill="none" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
        <Area yAxisId="left" type="monotone" dataKey="nominaal"  name="Nominaal"  stroke={CHART_COLORS.nominaal} fill="url(#gradNom)"  strokeWidth={2} dot={false} />
        <Area yAxisId="left" type="monotone" dataKey="naBox3"    name="Na box 3"  stroke={CHART_COLORS.naBox3}   fill="url(#gradBox3)" strokeWidth={2} dot={false} />
        <Area yAxisId="left" type="monotone" dataKey="reeel"     name="Reëel"     stroke={CHART_COLORS.reeel}    fill="url(#gradReeel)" strokeWidth={2} dot={false} />

        {hasTax && (
          <Area
            yAxisId={showTaxAxis ? 'tax' : 'left'}
            type="monotone"
            dataKey="cumulatieveBelasting"
            name="Belasting cumulatief"
            stroke={CHART_COLORS.belasting}
            fill="rgba(216,90,48,0.15)"
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
