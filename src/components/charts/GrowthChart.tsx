import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatEuro } from '../../utils/formatters'

interface DataPoint {
  label: string
  waarde: number
  ingelegd: number
  reeel: number
}

interface Props {
  data: DataPoint[]
}

export function GrowthChart({ data }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={v => `€${(Number(v) / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} width={64} />
        <Tooltip formatter={(v) => formatEuro(Number(v))} />
        <Legend />
        <Line type="monotone" dataKey="waarde" name="Waarde" stroke="#2563eb" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ingelegd" name="Ingelegd" stroke="#9ca3af" strokeWidth={2} dot={false} strokeDasharray="5 5" />
        <Line type="monotone" dataKey="reeel" name="Reëel" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
