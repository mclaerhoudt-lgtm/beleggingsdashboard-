import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'

interface DataPoint {
  label: string
  rendement: number
}

interface Props {
  data: DataPoint[]
}

export function ReturnChart({ data }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={v => `${Number(v).toFixed(0)}%`}
          tick={{ fontSize: 11 }}
          width={40}
          tickMargin={4}
        />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Rendement']} />
        <ReferenceLine y={0} stroke="#6b7280" />
        <Bar dataKey="rendement" radius={[3, 3, 0, 0]} maxBarSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.rendement >= 0 ? '#22c55e' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
