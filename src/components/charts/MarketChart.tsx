import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Legend, ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from 'recharts'
import { formatEuro } from '../../utils/formatters'

export interface MarketDataPoint {
  label: string
  koers: number
  rendement: number     // month-over-month %
  verschilEuro: number  // koers − prev_koers
  isBest?: boolean
  isWorst?: boolean
}

interface Props {
  data: MarketDataPoint[]
  name: string
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────

function Tooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; payload: MarketDataPoint }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const rendIsPos = d.rendement >= 0

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl p-3 shadow-lg text-sm min-w-[160px]">
      <p className="font-semibold text-gray-700 dark:text-gray-200 mb-2">{label}</p>
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

// ─── Best/worst label renderer ───────────────────────────────────────────────

function BestWorstLabel(props: {
  x?: number; y?: number; width?: number; value?: number; index?: number;
  data: MarketDataPoint[]
}) {
  const { x = 0, y = 0, width = 0, value = 0, index = 0, data } = props
  const d = data[index]
  if (!d?.isBest && !d?.isWorst) return null
  const isPos = (value as number) >= 0
  const dy = isPos ? -6 : 14
  return (
    <text
      x={(x as number) + (width as number) / 2}
      y={(y as number) + dy}
      textAnchor="middle"
      fontSize={9}
      fontWeight={600}
      fill={d.isBest ? '#16a34a' : '#dc2626'}
    >
      {isPos ? '+' : ''}{(value as number).toFixed(1)}%
    </text>
  )
}

// ─── Main chart ──────────────────────────────────────────────────────────────

export function MarketChart({ data, name }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ComposedChart data={data} margin={{ top: 20, right: 48, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis
          yAxisId="left"
          tickFormatter={v => `€${Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(1)}k` : Number(v)}`}
          tick={{ fontSize: 11 }}
          width={64}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={v => `${Number(v).toFixed(0)}%`}
          tick={{ fontSize: 11 }}
          width={44}
        />
        {/* @ts-expect-error recharts v3 content prop typing */}
        <Tooltip content={<Tooltip />} />
        <Legend />
        <ReferenceLine yAxisId="right" y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Bar yAxisId="right" dataKey="rendement" name="Maand %" radius={[3, 3, 0, 0]} barSize={12}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.isBest ? '#16a34a' : d.isWorst ? '#dc2626' : d.rendement >= 0 ? '#86efac' : '#fca5a5'}
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
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
