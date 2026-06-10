import { Router } from 'express'
import Social      from '../models/Social.js'

const router = Router()

router.get('/posts', async (req, res) => {
  try {
    const { platform, ticker, window: win = 60, limit = 50 } = req.query
    const filter = {
      created_at: { $gte: new Date(Date.now() - Number(win) * 60000) }
    }
    if (platform && platform !== 'all') filter.platform = platform
    if (ticker) filter.ticker = ticker.toUpperCase()
    const posts = await Social.find(filter).sort({ created_at: -1 }).limit(Number(limit)).lean()
    res.json({ posts })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/tickers', async (req, res) => {
  try {
    const tickers = await Social.aggregate([
      { $match: { ticker: { $exists: true, $ne: null }, created_at: { $gte: new Date(Date.now() - 86400000) } } },
      { $group: { _id: '$ticker', count: { $sum: 1 }, sentiment: { $avg: '$sentiment' } } },
      { $sort: { count: -1 } }, { $limit: 20 },
      { $project: { _id: 0, ticker: '$_id', count: 1, sentiment: { $round: ['$sentiment', 2] } } },
    ])
    res.json({ tickers })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/phrases', async (req, res) => {
  try {
    const posts = await Social.find({
      created_at: { $gte: new Date(Date.now() - 3600000) }
    }).select('content').lean()
    const stop = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','are','was'])
    const freq = {}
    for (const p of posts)
      for (const w of (p.content || '').toLowerCase().split(/\W+/))
        if (w.length > 3 && !stop.has(w)) freq[w] = (freq[w] || 0) + 1
    const phrases = Object.entries(freq)
      .filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 20)
      .map(([phrase, count]) => ({ phrase, count }))
    res.json({ phrases })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/health', async (req, res) => {
  try {
    const since = new Date(Date.now() - 3600000)
    const subs  = ['wallstreetbets', 'stocks', 'investing', 'SecurityAnalysis', 'options']
    const health = await Promise.all(subs.map(async n => ({
      name:   `r/${n}`,
      status: await Social.countDocuments({
        platform: 'reddit',
        author:   { $regex: n, $options: 'i' },
        created_at: { $gte: since }
      }) > 0 ? 'healthy' : 'degraded',
    })))
    res.json({ subreddits: health })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/', async (req, res) => {
  try {
    const { platform, ticker, limit = 50 } = req.query
    const filter = {}
    if (platform && platform !== 'all') filter.platform = platform
    if (ticker) filter.ticker = ticker.toUpperCase()
    res.json(await Social.find(filter).sort({ created_at: -1 }).limit(Number(limit)).lean())
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router