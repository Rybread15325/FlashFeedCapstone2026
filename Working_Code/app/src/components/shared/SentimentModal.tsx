export function SentimentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
         onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-6 w-[480px]"
           onClick={e => e.stopPropagation()}>
        <div className="text-white font-semibold mb-4">Sentiment Analysis</div>
        <p className="text-neutral text-sm mb-4">Sentiment analysis uses NLP to measure market sentiment across social platforms (StockTwits, Reddit, Bluesky) and news sources. You can view ticker-specific sentiment trends and signal strength indicators.</p>\n        <div className="bg-bg/50 border border-border rounded p-3 mb-4 text-xs text-neutral space-y-2">\n          <div><strong>Features coming soon:</strong></div>\n          <ul className="list-disc list-inside space-y-1">\n            <li>Real-time sentiment score by ticker</li>\n            <li>Sentiment trend charts (24h, 7d, 30d)</li>\n            <li>Source breakdown (social vs news)</li>\n            <li>Sentiment-based alerts and filters</li>\n          </ul>\n        </div>
        <button onClick={onClose}
                className="mt-4 px-4 py-2 bg-accent text-white text-sm rounded hover:bg-sky-400 transition-colors">
          Close
        </button>
      </div>
    </div>
  )
}