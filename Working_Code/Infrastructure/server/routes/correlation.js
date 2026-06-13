import { Router } from 'express'
import mongoose from 'mongoose'
import Correlation from '../models/Correlation.js'

const router = Router()

const NON_STOCK_TICKERS = new Set([
  'BTC', 'ETH', 'LTC', 'DOGE', 'SOL', 'ADA', 'XRP', 'BNB', 'DOT', 'AVAX',
  'MATIC', 'SHIB', 'TRX', 'BCH', 'LINK', 'ATOM', 'UNI', 'ETC', 'FIL',
  'USD', 'USDT', 'USDC', 'SPOT',
])

function recentArticleMatch(days = 2) {
  const n = Number(days || 0)
  const cutoffMs = Date.now() - Math.max(1, n) * 86_400_000
  const cutoffSec = Math.floor(cutoffMs / 1000)
  const cutoffDate = new Date(cutoffMs)
  return {
    $or: [
      { publish_date: { $gte: cutoffDate } },
      { publish_date: { $gte: cutoffSec } },
      { fetched_date: { $gte: cutoffDate } },
      { fetched_date: { $gte: cutoffSec } },
      { detected_at: { $gte: cutoffDate } },
      { detected_at: { $gte: cutoffSec } },
      { createdAt: { $gte: cutoffDate } },
    ],
  }
}

function sentimentScore(row) {
  const total = Math.max(1, Number(row.count || 0))
  const priorNeutralWeight = 4
  return Number((((row.bullish || 0) - (row.bearish || 0)) / (total + priorNeutralWeight)).toFixed(3))
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function signWithDeadband(value, deadband = 0.05) {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || Math.abs(n) < deadband) return 0
  return Math.sign(n)
}

function alignmentScore({ sentiment, changePct, sampleSize }) {
  const sentimentSign = signWithDeadband(sentiment, 0.05)
  const priceSign = signWithDeadband(changePct, 0.1)
  if (!sentimentSign || !priceSign) return 0

  const direction = sentimentSign === priceSign ? 1 : -1
  const sentimentStrength = clamp(Math.abs(Number(sentiment || 0)), 0, 1)
  const priceStrength = clamp(Math.abs(Number(changePct || 0)) / 10, 0, 1)
  const sampleConfidence = clamp(Math.log1p(Number(sampleSize || 0)) / Math.log1p(50), 0.05, 1)
  const raw = direction * sampleConfidence * (sentimentStrength * 0.65 + priceStrength * 0.35)
  return Number(clamp(raw, -0.85, 0.85).toFixed(3))
}

function tickerPipeline(days, limit) {
  return [
    {
      $match: {
        ...recentArticleMatch(days),
        ticker: { $exists: true, $nin: ['', null] },
      },
    },
    {
      $addFields: {
        _ticker_parts: {
          $map: {
            input: { $split: [{ $toUpper: { $toString: '$ticker' } }, ','] },
            as: 'ticker_part',
            in: { $trim: { input: '$$ticker_part' } },
          },
        },
      },
    },
    { $unwind: '$_ticker_parts' },
    { $match: { _ticker_parts: { $ne: '', $nin: Array.from(NON_STOCK_TICKERS) } } },
    {
      $group: {
        _id: '$_ticker_parts',
        count: { $sum: 1 },
        bullish: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ['$sentiment', ''] } }, 'bullish'] }, 1, 0] },
        },
        bearish: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ['$sentiment', ''] } }, 'bearish'] }, 1, 0] },
        },
        neutral: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ['$sentiment', 'neutral'] } }, 'neutral'] }, 1, 0] },
        },
        sources: { $addToSet: '$source' },
        latest_publish: { $max: '$publish_date' },
      },
    },
    { $sort: { count: -1, latest_publish: -1 } },
    { $limit: Math.max(1, Math.min(300, Number(limit || 150))) },
  ]
}

async function generatedCorrelations({ days = 2, limit = 150 } = {}) {
  const db = mongoose.connection.db
  if (!db) return []

  const rows = await db.collection('articles').aggregate(tickerPipeline(days, limit)).toArray()
  const quoteDocs = await db.collection('screeners').find({
    ticker: { $in: rows.map(row => String(row._id || '').toUpperCase()) },
  }).toArray()
  const quoteMap = new Map(quoteDocs.map(doc => [String(doc.ticker || '').toUpperCase(), doc]))

  return rows.map(row => {
    const ticker = String(row._id || '').toUpperCase()
    const score = sentimentScore(row)
    const quote = quoteMap.get(ticker)
    const rawChange = quote?.change_pct ?? quote?.change_percent
    if (rawChange == null || rawChange === '') return null
    const changePct = Number(rawChange)
    if (!Number.isFinite(changePct)) return null
    const sampleSize = Number(row.count || 0)
    const priceMomentum = Number((changePct / 10).toFixed(3))
    const alignment = alignmentScore({ sentiment: score, changePct, sampleSize })
    const confidence = Number(clamp(Math.log1p(sampleSize) / Math.log1p(50), 0.05, 0.98).toFixed(2))

    return {
      ticker,
      correlation: alignment,
      alignment,
      p_value: null,
      sample_size: sampleSize,
      window_days: days,
      news_sentiment: score,
      price_momentum: priceMomentum,
      change_pct: changePct,
      price: Number.isFinite(Number(quote?.price)) ? Number(Number(quote.price).toFixed(2)) : null,
      previous_close: Number.isFinite(Number(quote?.previous_close)) ? Number(Number(quote.previous_close).toFixed(2)) : null,
      quote_source: quote?.quote_source || null,
      quote_time: quote?.quote_time || null,
      quote_updated_at: quote?.quote_updated_at || null,
      quote_status: quote?.quote_status || 'priced',
      bullish_count: row.bullish || 0,
      bearish_count: row.bearish || 0,
      neutral_count: row.neutral || 0,
      article_count: sampleSize,
      confidence,
      direction: alignment > 0 ? 'aligned' : alignment < 0 ? 'divergent' : 'neutral',
      sources: (row.sources || []).filter(Boolean).slice(0, 5),
      generated: true,
      signal_type: 'sentiment_price_alignment',
      methodology: 'Conservative alignment score from recent article sentiment, latest stored quote percent change, and sample confidence. This is not a Pearson historical correlation.',
      updated_at: new Date(),
    }
  }).filter(Boolean)
}

router.get('/', async (req, res) => {
  try {
    const days = Number(req.query.days || 2)
    const limit = Number(req.query.limit || 150)
    const entries = (await generatedCorrelations({ days, limit }))
      .sort((a, b) => Math.abs(b.correlation || 0) - Math.abs(a.correlation || 0))
      .slice(0, limit)

    const aligned = entries.filter(row => (row.correlation || 0) > 0).length
    const divergent = entries.filter(row => (row.correlation || 0) < 0).length
    const neutral = entries.length - aligned - divergent
    const avgAbs = entries.length
      ? entries.reduce((sum, row) => sum + Math.abs(Number(row.correlation || 0)), 0) / entries.length
      : 0

    res.json({
      entries,
      results: entries,
      count: entries.length,
      signal_type: 'sentiment_price_alignment',
      methodology: 'Current dashboard alignment score, not Pearson correlation. Price fields come from stored quote snapshots refreshed by the quote importer. True Pearson requires intraday price bars plus rolling social sentiment/density.',
      summary: {
        aligned,
        divergent,
        neutral,
        avg_abs_correlation: null,
        avg_abs_alignment: Number(avgAbs.toFixed(3)),
        strongest: entries[0] || null,
      },
      true_correlation_available: false,
      accuracy: {
        accuracy_1h: null,
        accuracy_24h: null,
      },
      days,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/run', async (req, res) => {
  try {
    const rows = await generatedCorrelations({ days: Number(req.query.days || req.body?.days || 2), limit: 150 })

    if (rows.length) {
      await Correlation.deleteMany({ ticker: { $nin: rows.map(row => row.ticker) } })
      await Correlation.bulkWrite(rows.map(row => ({
        updateOne: {
          filter: { ticker: row.ticker },
          update: { $set: { ...row, updated_at: new Date() } },
          upsert: true,
        },
      })))
    }

    res.json({
      success: true,
      saved: rows.length,
      signal_type: 'sentiment_price_alignment',
      message: `Generated ${rows.length} sentiment/price alignment signals.`,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

export default router
