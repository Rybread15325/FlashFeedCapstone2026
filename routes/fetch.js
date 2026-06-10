import { Router } from 'express'
import Article    from '../models/Article.js'

const router = Router()

router.post('/fetch', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'ANTHROPIC_API_KEY not set in .env'
    })
  }

  const now = Math.floor(Date.now() / 1000)
  const t0  = Date.now()

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: `Generate 12 realistic financial news articles for ${new Date().toDateString()}.
Return ONLY a raw JSON array — no markdown, no backticks, no preamble.

Shape: {"id":"1","title":"headline","source":"Reuters","category":"Earnings","publish_date":${now - 300},"ticker":"NVDA","company":"NVIDIA","sentiment":"bullish","ml_confidence":0.91}

Rules:
- Exactly 12 | 5 bullish, 4 bearish, 3 neutral
- Sources: Reuters Bloomberg WSJ CNBC FT MarketWatch
- 8 with tickers (AAPL TSLA NVDA MSFT META AMZN GOOGL NFLX AMD JPM XOM PYPL MRNA PLTR ARM); 4 macro (ticker:null)
- publish_date: unix seconds, 5 min to 8 hours ago
- ml_confidence: 0.65-0.98
Return ONLY the JSON array.`,
        }],
      }),
    })

    const claudeData = await claudeRes.json()
    if (claudeData.error) throw new Error(claudeData.error.message)

    const raw      = (claudeData.content?.[0]?.text || '')
      .replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim()
    const incoming = JSON.parse(raw)

    const ops = incoming.map(a => ({
      updateOne: {
        filter: { article_id: String(a.id) },
        update: {
          $set: {
            article_id:    String(a.id),
            title:         a.title,
            source:        a.source,
            category:      a.category,
            publish_date:  new Date((a.publish_date || now) * 1000),
            ticker:        a.ticker || undefined,
            company:       a.company || undefined,
            sentiment:     a.sentiment,
            ml_confidence: a.ml_confidence,
            url:           a.url || '#',
          },
        },
        upsert: true,
      },
    }))
    const result = await Article.bulkWrite(ops)
    const total  = await Article.countDocuments()

    res.json({
      success:      true,
      new_articles: result.upsertedCount,
      duplicates:   result.matchedCount,
      total,
      ms:           Date.now() - t0,
    })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.get('/status', async (req, res) => {
  try {
    res.json({ ok: true, database: { articles: await Article.countDocuments() } })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

router.get('/market/status', (req, res) => {
  const now  = new Date()
  const day  = now.getUTCDay()
  const h    = now.getUTCHours()
  const m    = now.getUTCMinutes()
  const open = day >= 1 && day <= 5 && (h > 13 || (h === 13 && m >= 30)) && h < 20
  res.json({ open })
})

router.get('/stats', async (req, res) => {
  try {
    const [sources, categories] = await Promise.all([
      Article.aggregate([
        { $group: { _id: '$source', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Article.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ])
    
    res.json({
      sources: sources.map(s => ({ source: s._id, count: s.count })),
      categories: categories.map(c => ({ category: c._id, count: c.count }))
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/keywords', async (req, res) => {
  try {
    const keywords = await Article.aggregate([
      { $group: { _id: '$ticker', count: { $sum: 1 } } },
      { $match: { _id: { $ne: null } } },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ])
    
    res.json({
      keywords: keywords.map(k => ({ keyword: k._id, count: k.count }))
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router