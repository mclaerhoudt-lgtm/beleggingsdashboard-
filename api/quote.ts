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

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: YahooMeta
      timestamp?: number[]
      indicators: {
        quote: Array<{ close: Array<number | null> }>
        adjclose?: Array<{ adjclose: Array<number | null> }>
      }
    }>
  }
}

interface MaandKoers {
  month: string   // YYYY-MM
  close: number
}

interface HistoryResult {
  symbol: string
  prices: MaandKoers[]
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

// Per-request in-memory cache (Edge Functions are short-lived, but helps with burst requests)
const cache = new Map<string, YahooResult>()
const historyCache = new Map<string, HistoryResult>()

async function fetchSymbol(symbol: string): Promise<YahooResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)

  const json = await res.json() as YahooChartResponse
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

// Monthly close prices for the last 5 years — used to build historical
// portfolio value / return charts instead of hand-entered placeholder data.
async function fetchHistory(symbol: string): Promise<HistoryResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=5y`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)

  const json = await res.json() as YahooChartResponse
  const result = json.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  // Actual close (not adjclose) — we need the real end-of-month share price
  // for valuation, not a dividend/split-adjusted backtest price.
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const adjcloses = result?.indicators?.adjclose?.[0]?.adjclose ?? []

  const prices: MaandKoers[] = []
  for (let i = 0; i < timestamps.length; i++) {
    const close = closes[i] ?? adjcloses[i]
    if (close == null) continue
    const month = new Date(timestamps[i] * 1000).toISOString().slice(0, 7)
    prices.push({ month, close })
  }

  return { symbol, prices }
}

async function handleQuotes(symbols: string[]): Promise<YahooResult[]> {
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

  return results
}

async function handleHistory(symbols: string[]): Promise<HistoryResult[]> {
  const results: HistoryResult[] = []

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const result = await fetchHistory(symbol)
        historyCache.set(symbol, result)
        results.push(result)
      } catch {
        const cached = historyCache.get(symbol)
        results.push(cached ?? { symbol, prices: [] })
      }
    }),
  )

  return results
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const symbolsParam = url.searchParams.get('symbols') ?? ''
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean)
  const isHistory = url.searchParams.get('history') === '1'

  if (symbols.length === 0) {
    return new Response(JSON.stringify({ error: 'symbols required' }), { status: 400 })
  }

  const results = isHistory ? await handleHistory(symbols) : await handleQuotes(symbols)

  return new Response(JSON.stringify(results), {
    headers: {
      'Content-Type': 'application/json',
      // Monthly history barely changes intra-day; live quotes stay short-lived.
      'Cache-Control': isHistory ? 'public, max-age=3600' : 'public, max-age=60',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
