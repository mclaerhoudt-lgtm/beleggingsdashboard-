import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'http'

// Fallback prices (updated daily — only used if Yahoo is unreachable from dev machine)
const DEV_FALLBACK: Record<string, { price: number; currency: string }> = {
  'VUSA.AS': { price: 123.40, currency: 'EUR' },
  'ASML.AS': { price: 1397.60, currency: 'EUR' },
}

async function fetchYahoo(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`)
  const json = await res.json() as {
    chart: { result: Array<{ meta: Record<string, unknown> }> }
  }
  const meta = json.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) throw new Error('No price in response')
  const price = meta.regularMarketPrice as number
  const prev = (meta.chartPreviousClose ?? meta.regularMarketPreviousClose ?? price) as number
  return {
    symbol,
    price,
    change: price - prev,
    changePercent: prev > 0 ? ((price - prev) / prev) * 100 : 0,
    currency: (meta.currency as string) ?? 'EUR',
    updatedAt: new Date().toISOString(),
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Beleggingsdashboard',
        short_name: 'Beleggen',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/query1\.finance\.yahoo\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'yahoo-finance', expiration: { maxAgeSeconds: 300 } },
          },
        ],
      },
    }),
    {
      // Intercept /api/quote in dev — runs in Node.js so no CORS restrictions
      name: 'dev-api-mock',
      configureServer(server) {
        server.middlewares.use(
          '/api/quote',
          async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
            try {
              const qs = req.url?.split('?')[1] ?? ''
              const symbols = new URLSearchParams(qs).get('symbols')?.split(',').filter(Boolean) ?? []

              const data = await Promise.all(
                symbols.map(async (symbol) => {
                  try {
                    return await fetchYahoo(symbol)
                  } catch (e) {
                    console.warn(`[dev-api-mock] Yahoo failed for ${symbol}: ${(e as Error).message} — using fallback`)
                    const fb = DEV_FALLBACK[symbol] ?? { price: 0, currency: 'EUR' }
                    return { symbol, price: fb.price, change: 0, changePercent: 0, currency: fb.currency, updatedAt: new Date().toISOString() }
                  }
                }),
              )

              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify(data))
            } catch (err) {
              next(err)
            }
          },
        )
      },
    },
  ],
})
