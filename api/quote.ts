export const config = { runtime: 'edge' }

interface YahooMeta {
  regularMarketPrice: number
  chartPreviousClose?: number
  regularMarketPreviousClose?: number
  currency?: string
}

interface YahooResult {
  symbol: string
  price: number
  change: number
  changePercent: number
  currency: string
  updatedAt: string
}

// Per-request in-memory cache (Edge Functions are short-lived, but helps with burst requests)
const cache = new Map<string, YahooResult>()

async function fetchSymbol(symbol: string): Promise<YahooResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)

  const json = await res.json() as { chart: { result: Array<{ meta: YahooMeta }> } }
  const meta = json.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error('No price')

  const price = meta.regularMarketPrice
  const prev = meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price
  const change = price - prev
  return {
    symbol,
    price,
    change,
    changePercent: prev > 0 ? (change / prev) * 100 : 0,
    currency: meta.currency ?? 'EUR',
    updatedAt: new Date().toISOString(),
  }
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const symbolsParam = url.searchParams.get('symbols') ?? ''
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400 })
  }

  const results: YahooResult[] = []

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await fetchSymbol(symbol)
        cache.set(symbol, result)
        results.push(result)
      } catch {
        // Return last cached value so the UI doesn't flash "—" on a transient error
        const cached = cache.get(symbol)
        if (cached) {
          results.push(cached)
        } else {
          // No cache — push price=0 so UI shows "—" instead of a wrong number
          results.push({ symbol, price: 0, change: 0, changePercent: 0, currency: 'EUR', updatedAt: new Date().toISOString() })
        }
      }
    }),
  )

  return new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
