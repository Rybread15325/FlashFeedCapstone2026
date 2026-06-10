export function WatchPanel({
  watchLines,
  watchInterval,
  onIntervalChange,
}: {
  watchLines: Array<{ text: string; type: string; ts: number }>
  watchInterval: string
  onIntervalChange: (interval: string) => void
}) {
  return (
    <div className="fixed bottom-4 right-4 w-96 bg-gray-900 text-white rounded-lg shadow-lg overflow-hidden">
      <div className="bg-gray-800 px-4 py-2 flex justify-between items-center">
        <h3 className="font-semibold">Watch Output</h3>
        <div className="flex items-center gap-2">
          <label className="text-xs">Interval (s):</label>
          <input
            type="number"
            value={watchInterval}
            onChange={(e) => onIntervalChange(e.target.value)}
            className="w-12 px-2 py-1 bg-gray-700 text-white rounded text-xs"
          />
        </div>
      </div>
      <div className="h-64 overflow-y-auto bg-gray-950 text-xs font-mono">
        {watchLines.map((line, i) => (
          <div
            key={i}
            className={`px-4 py-1 ${
              line.type === 'error'
                ? 'text-red-400'
                : line.type === 'success'
                  ? 'text-green-400'
                  : 'text-gray-300'
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>
    </div>
  )
}
