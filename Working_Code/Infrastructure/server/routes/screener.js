import { Router } from 'express'
import mongoose from 'mongoose'
import Screener from '../models/Screener.js'

const router = Router()
const NON_STOCK_TICKERS = new Set([
  'BTC', 'ETH', 'LTC', 'DOGE', 'SOL', 'ADA', 'XRP', 'BNB', 'DOT', 'AVAX',
  'MATIC', 'SHIB', 'TRX', 'BCH', 'LINK', 'ATOM', 'UNI', 'ETC', 'FIL',
  'USD', 'USDT', 'USDC', 'SPOT',
])

function recentArticleMatch(days = 2) {
  const n = Number(days || 0)
  if (!Number.isFinite(n) || n <= 0) return {}

  const cutoffMs = Date.now() - n * 86_400_000
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

function stableHash(value) {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function derivedNumber(ticker, min, max, decimals = 2, salt = '') {
  const pct = (stableHash(`${ticker}:${salt}`) % 10000) / 10000
  return Number((min + (max - min) * pct).toFixed(decimals))
}

function nullableNumber(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function nullableFixed(value, decimals = 2) {
  const n = nullableNumber(value)
  return n == null ? null : Number(n.toFixed(decimals))
}

function marketCapBucket(marketCap) {
  const cap = Number(marketCap || 0)
  if (cap >= 200e9) return 'Mega'
  if (cap >= 10e9) return 'Large'
  if (cap >= 2e9) return 'Mid'
  if (cap >= 300e6) return 'Small'
  if (cap > 0) return 'Micro'
  return 'Unknown'
}

function normalizeScreenerRow(doc = {}) {
  const ticker = String(doc.ticker || '').toUpperCase()
  const hasStoredPrice = doc.price != null
  const price = nullableFixed(doc.price, 2)
  const change = doc.change_pct ?? doc.change_percent
  const changePct = nullableFixed(change, 2)
  const volume = nullableNumber(doc.volume)
  const avgVolume = nullableNumber(doc.avg_volume)
  const relVolume = volume != null && avgVolume ? Number((volume / Math.max(1, avgVolume)).toFixed(2)) : null
  const marketCap = nullableNumber(doc.market_cap)
  const avgSentiment = Number(doc.avg_sentiment ?? doc.news_sentiment ?? doc.structured_sentiment ?? 0)

  return {
    ticker,
    company: doc.company || '',
    price,
    change_pct: changePct,
    volume,
    avg_volume: avgVolume,
    rel_volume: relVolume,
    market_cap: marketCap,
    market_cap_bucket: marketCapBucket(marketCap),
    sector: doc.sector || 'Unclassified',
    industry: doc.industry || 'Unclassified',
    country: doc.country || '',
    exchange: doc.exchange || '',
    index: doc.index || '',
    avg_sentiment: avgSentiment,
    social_sentiment: Number(doc.social_sentiment ?? 0),
    structured_sentiment: Number(doc.structured_sentiment ?? doc.news_sentiment ?? avgSentiment),
    message_count: Number(doc.message_count ?? 0),
    news_article_count: Number(doc.news_article_count ?? 0),
    bullish_count: Number(doc.bullish_count ?? 0),
    bearish_count: Number(doc.bearish_count ?? 0),
    neutral_count: Number(doc.neutral_count ?? 0),
    sources: doc.sources || [],
    pe_ratio: nullableNumber(doc.pe_ratio ?? doc.pe),
    forward_pe: nullableNumber(doc.forward_pe),
    peg: nullableNumber(doc.peg),
    ps_ratio: nullableNumber(doc.ps_ratio),
    pb_ratio: nullableNumber(doc.pb_ratio),
    dividend_yield: nullableNumber(doc.dividend_yield),
    eps_growth_this_y: nullableNumber(doc.eps_growth_this_y),
    eps_growth_next_y: nullableNumber(doc.eps_growth_next_y),
    sales_growth: nullableNumber(doc.sales_growth),
    gross_margin: nullableNumber(doc.gross_margin),
    operating_margin: nullableNumber(doc.operating_margin),
    roe: nullableNumber(doc.roe),
    debt_equity: nullableNumber(doc.debt_equity),
    beta: nullableNumber(doc.beta),
    rsi: nullableNumber(doc.rsi),
    sma20: nullableNumber(doc.sma20),
    sma50: nullableNumber(doc.sma50),
    sma200: nullableNumber(doc.sma200),
    perf_week: nullableNumber(doc.perf_week),
    perf_month: nullableNumber(doc.perf_month),
    perf_quarter: nullableNumber(doc.perf_quarter),
    perf_half: nullableNumber(doc.perf_half),
    perf_year: nullableNumber(doc.perf_year),
    perf_ytd: nullableNumber(doc.perf_ytd),
    atr: nullableNumber(doc.atr),
    gap: nullableNumber(doc.gap),
    analyst: doc.analyst || null,
    target_price: nullableFixed(doc.target_price, 2),
    inst_own: nullableNumber(doc.inst_own),
    insider_own: nullableNumber(doc.insider_own),
    float_short: nullableNumber(doc.float_short),
    earnings_date: doc.earnings_date || null,
    previous_close: nullableFixed(doc.previous_close, 2),
    quote_source: doc.quote_source || null,
    quote_updated_at: doc.quote_updated_at || null,
    quote_status: doc.quote_status || (hasStoredPrice ? 'priced' : 'missing'),
  }
}

function articleTickerPipeline(days, limit, skipTickers = []) {
  const skip = [
    ...skipTickers.filter(Boolean).map(t => String(t).toUpperCase()),
    ...Array.from(NON_STOCK_TICKERS),
  ]
  const pipeline = [
    {
      $match: {
        ...recentArticleMatch(days),
        ticker: { $exists: true, $nin: ['', null] },
      }
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
    { $match: { _ticker_parts: { $ne: '', ...(skip.length ? { $nin: skip } : {}) } } },
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

  return pipeline
}

function articleTickerToScreenerRow(row) {
  const score = sentimentScore(row)
  return normalizeScreenerRow({
    ticker: row._id,
    company: '',
    price: null,
    volume: null,
    market_cap: null,
    sector: 'News matched',
    industry: 'Ticker mentions',
    avg_sentiment: score,
    social_sentiment: 0,
    structured_sentiment: score,
    message_count: row.count || 0,
    news_article_count: row.count || 0,
    bullish_count: row.bullish || 0,
    bearish_count: row.bearish || 0,
    neutral_count: row.neutral || 0,
    sources: (row.sources || []).filter(Boolean).slice(0, 6),
  })
}

// GET /api/screener
router.get('/', async (req, res) => {
  try {
    const { sector, signal, orderBy = 'ticker', orderDir = 'asc', limit = 150, days = 2 } = req.query
    const filter = {}
    if (sector) filter.sector = sector
    if (signal === 'social_bullish') filter.social_sentiment = { $gte: 0.3 }
    if (signal === 'social_bearish') filter.social_sentiment = { $lte: -0.3 }
    if (signal === 'unusual_volume') filter.volume = { $gte: 30000000 }

    const sort = { [orderBy]: orderDir === 'asc' ? 1 : -1 }
    const requestedLimit = Math.max(1, Math.min(300, Number(limit || 150)))
    const data = (await Screener.find(filter).sort(sort).limit(requestedLimit).lean()).map(normalizeScreenerRow)

    if (data.length < requestedLimit && mongoose.connection.db) {
      const existing = new Set(data.map(row => String(row.ticker || '').toUpperCase()))
      const fillerRows = await mongoose.connection.db
        .collection('articles')
        .aggregate(articleTickerPipeline(days, requestedLimit - data.length, Array.from(existing)))
        .toArray()

      data.push(...fillerRows.map(articleTickerToScreenerRow))
    }

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/screener/upsert  — upsert a single ticker
router.post('/upsert', async (req, res) => {
  try {
    const doc = await Screener.findOneAndUpdate(
      { ticker: req.body.ticker },
      { $set: { ...req.body, updated_at: new Date() } },
      { upsert: true, new: true }
    )
    res.json(doc)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
