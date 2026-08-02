import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { formatEuro } from '../../utils/formatters'
import { COLORS } from '../../theme'

interface DataPoint {
  label: string
  waarde: number
  ingelegd: number
  reeel: number
}

interface Props {
  data: DataPoint[]
}

function fmtY(v: number): string {
  const n = Number(v)
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `€${Math.round(n / 1000)}k`
  return `€${Math.round(n)}`
}

export function GrowthChart({ data }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={fmtY}
          tick={{ fontSize: 11 }}
          width={48}
          tickMargin={4}
        />
        <Tooltip formatter={(v) => formatEuro(Number(v))} />
        <Legend />
        <Line type="monotone" dataKey="waarde"   name="Waarde"  stroke={COLORS.primary} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="ingelegd" name="Ingelegd" stroke={COLORS.axisMuted} strokeWidth={2} dot={false} strokeDasharray="5 5" />
        <Line type="monotone" dataKey="reeel"    name="Reëel"   stroke={COLORS.secondary} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
