import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatEuro } from '../../utils/formatters'
import { CATEGORICAL_COLORS } from '../../theme'

interface DataPoint {
  name: string
  value: number
}

interface Props {
  data: DataPoint[]
}

export function AllocChart({ data }: Props) {
  if (data.length === 0) return null
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="75%"
          dataKey="value"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatEuro(Number(v))} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
