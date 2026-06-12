import useSWR from 'swr'
import { CorrelationTable } from './CorrelationTable'
import { EmptyState } from './EmptyState'
import { RunButton } from './RunButton'
import type { CorrelationEntry } from '@/lib/types'

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function CorrelationPage() {
  const { data, isLoading, mutate } = useSWR('/api/correlation', fetcher, { refreshInterval: 60_000 })
  const entries: CorrelationEntry[] = data?.entries ?? []
  const summary = data?.summary
  const avgAbs = summary?.avg_abs_alignment ?? (
    entries.length ? entries.reduce((sum, row) => sum + Math.abs(row.correlation || 0), 0) / entries.length : 0
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-white font-semibold text-lg">Sentiment / Price Alignment</h1>
          {typeof data?.accuracy?.accuracy_1h === 'number' && typeof data?.accuracy?.accuracy_24h === 'number' && (
            <div className="text-neutral text-xs mt-0.5">
              1h accuracy: {(data.accuracy.accuracy_1h * 100).toFixed(1)}% · 24h accuracy: {(data.accuracy.accuracy_24h * 100).toFixed(1)}%
            </div>
          )}
          <div className="text-neutral text-xs mt-0.5">
            Latest quote snapshot alignment, not a historical Pearson correlation.
          </div>
        </div>
        <RunButton onComplete={() => mutate()} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Metric label="Signals" value={String(entries.length)} />
        <Metric label="Aligned / Divergent" value={`${summary?.aligned ?? entries.filter(e => e.correlation >= 0).length}/${summary?.divergent ?? entries.filter(e => e.correlation < 0).length}`} tone="text-emerald-300" />
        <Metric label="Avg |Align|" value={avgAbs ? avgAbs.toFixed(3) : '--'} tone="text-yellow-300" />
        <Metric label="Strongest" value={summary?.strongest?.ticker ?? entries[0]?.ticker ?? '--'} tone="text-sky-300" />
      </div>
      {isLoading
        ? <div className="text-neutral text-sm animate-pulse p-4">Loading correlation data...</div>
        : entries.length === 0
          ? <EmptyState onRun={() => mutate()} />
          : <CorrelationTable entries={entries} />
      }
    </div>
  )
}

function Metric({ label, value, tone = 'text-white' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg px-3 py-2 min-w-0">
      <div className={`font-mono text-lg font-semibold truncate ${tone}`}>{value}</div>
      <div className="text-[10px] uppercase text-neutral mt-0.5">{label}</div>
    </div>
  )
}
