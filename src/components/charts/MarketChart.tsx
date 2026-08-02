import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts'
import { Tooltip } from 'recharts'
import { formatEuro } from '../../utils/formatters'
import { COLORS } from '../../theme'

export interface MarketDataPoint {
  label: string
  koers: number
  rendement: number
  verschilEuro: number
  isBest?: boolean
  isWorst?: boolean
}

interface Props {
  data: MarketDataPoint[]
  name: string
}

// ─── Y-axis formatter ─────────────────────────────────────────────────────────
function fmtY(v: number): string {
  const n = Number(v)
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `€${Math.round(n / 1000)}k`
  return `€${Math.round(n)}`
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; payload: MarketDataPoint }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const rendIsPos = d.rendement >= 0
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-lg text-sm min-w-[150px]">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</p>
      <p className="text-gray-600 dark:text-gray-300">
        Koers: <span className="font-medium tabular-nums">{formatEuro(d.koers)}</span>
      </p>
      <p className={`font-medium tabular-nums ${rendIsPos ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
        Maand: {rendIsPos ? '+' : ''}{d.rendement.toFixed(2)}%
      </p>
      <p className={`tabular-nums text-xs ${d.verschilEuro >= 0 ? 'text-green-500' : 'text-red-400'}`}>
        Verschil: {d.verschilEuro >= 0 ? '+' : ''}{formatEuro(d.verschilEuro)}
      </p>
    </div>
  )
}

// ─── Best/worst label ─────────────────────────────────────────────────────────
function BestWorstLabel(props: {
  x?: number; y?: number; width?: number; value?: number; index?: number;
  data: MarketDataPoint[]
}) {
  const { x = 0, y = 0, width = 0, value = 0, index = 0, data } = props
  const d = data[index]
  if (!d?.isBest && !d?.isWorst) return null
  const isPos = (value as number) >= 0
  return (
    <text
      x={(x as number) + (width as number) / 2}
      y={(y as number) + (isPos ? -5 : 12)}
      textAnchor="middle"
      fontSize={9}
      fontWeight={600}
      fill={d.isBest ? COLORS.positive : COLORS.negative}
    >
      {isPos ? '+' : ''}{(value as number).toFixed(1)}%
    </text>
  )
}

// ─── Main chart ───────────────────────────────────────────────────────────────
export function MarketChart({ data, name }: Props) {
  if (data.length === 0) return null

  // Responsive bar size: narrow on mobile, wider on larger screens
  const barSize = typeof window !== 'undefined' && window.innerWidth < 640 ? 8 : 14

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={data} margin={{ top: 20, right: 44, left: 0, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10 }}
          angle={-45}
          textAnchor="end"
          height={50}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="left"
          tickFormatter={fmtY}
          tick={{ fontSize: 10 }}
          width={52}
          tickMargin={4}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={v => `${Number(v).toFixed(0)}%`}
          tick={{ fontSize: 10 }}
          width={36}
          tickMargin={4}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine yAxisId="right" y={0} stroke={COLORS.axisMuted} strokeDasharray="3 3" />
        <Bar yAxisId="right" dataKey="rendement" name="Maand %" radius={[3, 3, 0, 0]} barSize={barSize}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.isBest ? COLORS.positive : d.isWorst ? COLORS.negative : d.rendement >= 0 ? COLORS.positiveLight : COLORS.negativeLight}
            />
          ))}
          <LabelList
            dataKey="rendement"
            content={(props) => <BestWorstLabel {...(props as Parameters<typeof BestWorstLabel>[0])} data={data} />}
          />
        </Bar>
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="koers"
          name={name}
          stroke={COLORS.primary}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
