'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import { CandlestickChart } from './CandlestickChart'
import { RSIChart } from './RSIChart'
import { MACDChart } from './MACDChart'
import { SentimentChart } from './SentimentChart'
import { getAllChartStocks } from '../lib/stocks'

interface ChartData {
  candles: Array<{ time: string | number; open: number; high: number; low: number; close: number; volume?: number }>
  bollinger?: { upper: Array<{ time: string | number; value: number }>; lower: Array<{ time: string | number; value: number }> }
  rsi?: Array<{ time: string | number; value: number }>
  macd?: { macd: Array<{ time: string | number; value: number }>; signal: Array<{ time: string | number; value: number }>; histogram: Array<{ time: string | number; value: number }> }
  predicted?: Array<{ time: string | number; value: number }>
  news_events?: Array<{ time: string | number; position?: string; color?: string; shape?: string; text?: string; title?: string; source?: string }>
  prediction_events?: Array<{ time: string | number; title?: string; text?: string; entry_price?: number; label_5m?: { return_pct?: number; direction_correct?: boolean } | null }>
  sentiment?: Array<{ time: string | number; value: number }>
  social_density?: Array<{ time: string | number; value: number; scaled?: number; count?: number; session?: string }>
  source_status?: { price?: string; price_source?: string; price_detail?: string; social?: string; news?: string; predictions?: string }
}

const RANGES = ['1d', '5d', '1mo', '3mo', '6mo', '1y'] as const
const INTERVALS = ['1m', '5m', '15m', '1h', '1d', '1wk'] as const
const RANGE_LABELS: Record<string, string> = { '1d': '1 Day', '5d': '5 Days', '1mo': '1 Month', '3mo': '3 Months', '6mo': '6 Months', '1y': '1 Year' }
const INT_LABELS: Record<string, string> = { '1m': '1 Minute', '5m': '5 Minute', '15m': '15 Minute', '1h': 'Hourly', '1d': 'Daily', '1wk': 'Weekly' }

const PANELS = [
  { key: 'density',     label: 'Message Density' },
  { key: 'sentiment',   label: 'Message Sentiment' },
  { key: 'predictions', label: 'Prediction Signals' },
  { key: 'rsi',         label: 'RSI (14)' },
  { key: 'macd',        label: 'MACD (12,26,9)' },
] as const

type PanelKey = typeof PANELS[number]['key']

export function ChartsPage() {
  const [ticker, setTicker] = useState('AAPL')
  const [range, setRange] = useState<string>('1d')
  const [interval, setInterval] = useState<string>('1m')
  const [data, setData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [autoLoaded, setAutoLoaded] = useState(false)
  const [panelsOpen, setPanelsOpen] = useState(false)
  const [visiblePanels, setVisiblePanels] = useState<Record<PanelKey, boolean>>({
    density: true, sentiment: true, predictions: true, rsi: true, macd: true,
  })
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!panelsOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPanelsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelsOpen])

  const togglePanel = (key: PanelKey) => {
    setVisiblePanels(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const visibleCount = Object.values(visiblePanels).filter(Boolean).length

  const loadChart = useCallback(async (override?: string) => {
    const sym = (typeof override === 'string' ? override : ticker).trim().toUpperCase()
    if (!sym) return
    setLoading(true)
    try {
      const res = await fetch(`/api/charts/${sym}?range=${range}&interval=${interval}`)
      const json = await res.json()
      setData(json)
      setActiveTicker(sym)
    } finally {
      setLoading(false)
    }
  }, [ticker, range, interval])

  useEffect(() => {
    if (!autoLoaded && !data && !loading) {
      setAutoLoaded(true)
      loadChart()
    }
  }, [autoLoaded, data, loading, loadChart])

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={getAllChartStocks().includes(ticker) ? ticker : ''}
          onChange={e => { const v = e.target.value; if (v) { setTicker(v); loadChart(v) } }}
          title="Top 50 stocks + your custom stocks (add them in Settings)"
          className="bg-bg border border-border text-sm text-neutral rounded px-2 py-2 focus:outline-none focus:border-accent"
        >
          <option value="">Top stocks ▾</option>
          {getAllChartStocks().map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && loadChart()}
          placeholder="Ticker (e.g. AAPL)"
          className="w-[140px] bg-bg border border-border text-sm text-white rounded px-3 py-2 font-mono focus:outline-none focus:border-accent placeholder:text-slate-600"
        />
        <select value={range} onChange={e => setRange(e.target.value)}
          className="bg-bg border border-border text-sm text-neutral rounded px-2 py-2 focus:outline-none focus:border-accent">
          {RANGES.map(r => <option key={r} value={r}>{RANGE_LABELS[r]}</option>)}
        </select>
        <select value={interval} onChange={e => setInterval(e.target.value)}
          className="bg-bg border border-border text-sm text-neutral rounded px-2 py-2 focus:outline-none focus:border-accent">
          {INTERVALS.map(i => <option key={i} value={i}>{INT_LABELS[i]}</option>)}
        </select>
        <button
          onClick={() => loadChart()}
          disabled={loading || !ticker.trim()}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded hover:bg-sky-400 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading...' : 'Load Chart'}
        </button>
        {activeTicker && (
          <span className="text-accent font-mono font-bold text-lg ml-2">{activeTicker}</span>
        )}

        {/* Charts panel dropdown */}
        <div className="relative ml-auto" ref={dropdownRef}>
          <button
            onClick={() => setPanelsOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface border border-border text-sm text-neutral rounded hover:border-accent hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
            </svg>
            Panels
            {visibleCount < PANELS.length && (
              <span className="bg-accent text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {visibleCount}
              </span>
            )}
            <span className="text-[10px]">{panelsOpen ? '▲' : '▼'}</span>
          </button>

          {panelsOpen && (
            <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-lg shadow-xl z-50 min-w-[200px] py-1">
              <div className="px-3 py-1.5 border-b border-border mb-1">
                <span className="text-[10px] text-neutral uppercase tracking-wide font-medium">Toggle chart panels</span>
              </div>
              {PANELS.map(p => (
                <label
                  key={p.key}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-border/40 cursor-pointer text-sm text-neutral hover:text-white transition-colors"
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${visiblePanels[p.key] ? 'bg-accent border-accent' : 'border-border'}`}>
                    {visiblePanels[p.key] && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={visiblePanels[p.key]}
                    onChange={() => togglePanel(p.key)}
                    className="sr-only"
                  />
                  {p.label}
                </label>
              ))}
              <div className="border-t border-border mt-1 px-3 py-1.5 flex gap-2">
                <button
                  onClick={() => setVisiblePanels({ density: true, sentiment: true, predictions: true, rsi: true, macd: true })}
                  className="text-[11px] text-accent hover:underline"
                >
                  Show all
                </button>
                <span className="text-neutral text-[11px]">·</span>
                <button
                  onClick={() => setVisiblePanels({ density: false, sentiment: false, predictions: false, rsi: false, macd: false })}
                  className="text-[11px] text-neutral hover:text-white hover:underline"
                >
                  Hide all
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts */}
      {data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <Status label="Price" value={data.source_status?.price ?? 'unknown'} />
            <Status label="Source" value={data.source_status?.price_source ?? 'pending'} />
            <Status label="Social" value={data.source_status?.social ?? 'pending'} />
            <Status label="News Markers" value={String(data.news_events?.length ?? 0)} />
            <Status label="Predictions" value={String(data.prediction_events?.length ?? 0)} />
            <Status label="Bars" value={String(data.candles?.length ?? 0)} />
          </div>
          <ChartCard title={`${INT_LABELS[interval] ?? interval} Price + Bollinger Bands`} height={300}>
            {data.candles?.length
              ? <CandlestickChart
                  candles={data.candles as any}
                  bollinger={data.bollinger as any}
                  predicted={data.predicted as any}
                  newsEvents={data.news_events as any}
                  density={data.social_density as any}
                  sentiment={data.sentiment as any}
                />
              : <EmptyChart message={data.source_status?.price_detail || 'No price bars returned for this interval.'} />}
          </ChartCard>
          {visiblePanels.density && (
            <ChartCard title="Rolling Message Density" height={120}>
              <SentimentChart data={(data.social_density ?? []).map(row => ({ time: row.time as any, value: row.scaled ?? row.value }))} />
            </ChartCard>
          )}
          {visiblePanels.sentiment && (
            <ChartCard title="Rolling Message Sentiment" height={120}>
              <SentimentChart data={data.sentiment ?? []} />
            </ChartCard>
          )}
          {visiblePanels.predictions && <PredictionEvents events={data.prediction_events ?? []} />}
          {visiblePanels.rsi && (
            <ChartCard title="RSI (14)" height={120}>
              <RSIChart data={data.rsi ?? []} />
            </ChartCard>
          )}
          {visiblePanels.macd && (
            <ChartCard title="MACD (12,26,9)" height={120}>
              <MACDChart data={data.macd} />
            </ChartCard>
          )}
        </div>
      ) : (
        <div className="text-center py-20 text-neutral">
          <div className="text-sm">Loading the default candle chart...</div>
        </div>
      )}
    </div>
  )
}

function eventTime(value: string | number) {
  const sec = typeof value === 'number' ? value : Math.floor(Date.parse(value) / 1000)
  if (!Number.isFinite(sec) || sec <= 0) return '--'
  return new Date(sec * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function PredictionEvents({ events }: { events: NonNullable<ChartData['prediction_events']> }) {
  if (!events.length) return null
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs text-neutral font-medium uppercase">Prediction Signals</span>
      </div>
      <div className="divide-y divide-border/60">
        {events.slice(-5).map((event, index) => {
          const actual = event.label_5m?.return_pct
          const correct = event.label_5m?.direction_correct
          return (
            <div key={`${event.time}-${index}`} className="grid grid-cols-[86px_1fr_100px] gap-2 px-3 py-2 text-xs items-center">
              <span className="font-mono text-neutral">{eventTime(event.time)}</span>
              <span className="text-slate-200 truncate">{event.title || event.text || 'Prediction signal'}</span>
              <span className={correct === true ? 'text-emerald-400 font-mono text-right' : correct === false ? 'text-orange-400 font-mono text-right' : 'text-neutral font-mono text-right'}>
                {actual == null ? 'pending' : `${actual > 0 ? '+' : ''}${Number(actual).toFixed(2)}%`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 min-w-0">
      <div className="font-mono text-sm text-white truncate">{value}</div>
      <div className="text-[10px] uppercase text-neutral mt-0.5">{label}</div>
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center px-4 text-center text-xs text-neutral">
      {message}
    </div>
  )
}

function ChartCard({ title, height, children }: { title: string; height: number; children: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs text-neutral font-medium uppercase tracking-wide">{title}</span>
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}
