'use client'
import { ScreenerRow } from './ScreenerRow'
import type { ScreenerRow as SR } from '@/lib/types'
import type { ViewMode } from './ScreenerPage'

interface Props { rows: SR[]; isLoading: boolean; viewMode: ViewMode }

const COLUMNS: Record<ViewMode, Array<{ key: string; label: string }>> = {
  overview: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'company', label: 'COMPANY' },
    { key: 'exchange', label: 'EXCH' },
    { key: 'country', label: 'COUNTRY' },
    { key: 'price', label: 'PRICE' },
    { key: 'change_pct', label: 'CHG%' },
    { key: 'volume', label: 'VOLUME' },
    { key: 'rel_volume', label: 'REL VOL' },
    { key: 'market_cap', label: 'MKT CAP' },
    { key: 'sector', label: 'SECTOR' },
    { key: 'avg_sentiment', label: 'SENT' },
    { key: 'message_count', label: 'MSGS' },
  ],
  valuation: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'price', label: 'PRICE' },
    { key: 'market_cap', label: 'MKT CAP' },
    { key: 'pe_ratio', label: 'P/E' },
    { key: 'forward_pe', label: 'FWD P/E' },
    { key: 'peg', label: 'PEG' },
    { key: 'ps_ratio', label: 'P/S' },
    { key: 'pb_ratio', label: 'P/B' },
    { key: 'dividend_yield', label: 'DIV %' },
    { key: 'target_price', label: 'TARGET' },
    { key: 'analyst', label: 'ANALYST' },
  ],
  financial: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'eps_growth_this_y', label: 'EPS THIS Y' },
    { key: 'eps_growth_next_y', label: 'EPS NEXT Y' },
    { key: 'sales_growth', label: 'SALES GROWTH' },
    { key: 'gross_margin', label: 'GROSS MGN' },
    { key: 'operating_margin', label: 'OP MGN' },
    { key: 'roe', label: 'ROE' },
    { key: 'debt_equity', label: 'DEBT/EQ' },
  ],
  ownership: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'inst_own', label: 'INST OWN' },
    { key: 'insider_own', label: 'INSIDER OWN' },
    { key: 'float_short', label: 'SHORT FLOAT' },
    { key: 'market_cap_bucket', label: 'CAP' },
    { key: 'index', label: 'INDEX' },
    { key: 'earnings_date', label: 'EARNINGS' },
  ],
  performance: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'change_pct', label: 'CHG%' },
    { key: 'perf_week', label: 'WEEK' },
    { key: 'perf_month', label: 'MONTH' },
    { key: 'perf_quarter', label: 'QUARTER' },
    { key: 'perf_half', label: 'HALF' },
    { key: 'perf_year', label: 'YEAR' },
    { key: 'perf_ytd', label: 'YTD' },
  ],
  technical: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'price', label: 'PRICE' },
    { key: 'change_pct', label: 'CHG%' },
    { key: 'volume', label: 'VOLUME' },
    { key: 'avg_volume', label: 'AVG VOL' },
    { key: 'rel_volume', label: 'REL VOL' },
    { key: 'rsi', label: 'RSI' },
    { key: 'sma20', label: 'SMA20' },
    { key: 'sma50', label: 'SMA50' },
    { key: 'sma200', label: 'SMA200' },
    { key: 'atr', label: 'ATR' },
    { key: 'gap', label: 'GAP' },
  ],
  sentiment: [
    { key: 'ticker', label: 'TICKER' },
    { key: 'social_sentiment', label: 'SOCIAL' },
    { key: 'message_count', label: 'POSTS' },
    { key: 'structured_sentiment', label: 'NEWS' },
    { key: 'news_article_count', label: 'ARTICLES' },
    { key: 'sources', label: 'SOURCES' },
    { key: 'bullish_count', label: 'BULL' },
    { key: 'bearish_count', label: 'BEAR' },
  ],
}

export function ScreenerTable({ rows, isLoading, viewMode }: Props) {
  const columns = COLUMNS[viewMode]

  if (isLoading) return <div className="text-neutral text-sm animate-pulse p-4">Loading screener data...</div>
  if (rows.length === 0) return (
    <div className="text-center py-12 text-neutral">
      <div className="text-3xl mb-2">🔍</div>
      <div className="text-sm">No tickers match current filters</div>
    </div>
  )

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border bg-bg/50">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-2 py-2 text-left text-[10px] text-neutral uppercase tracking-wide font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/30">
            {rows.map(row => <ScreenerRow key={row.ticker} row={row} columns={columns} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
