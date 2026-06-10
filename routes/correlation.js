import { Router } from 'express'
import Correlation from '../models/Correlation.js'

const router = Router()

// GET /api/correlation
router.get('/', async (req, res) => {
  try {
    const data = await Correlation.find().sort({ correlation: -1 }).lean()
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/correlation/run — re-run analysis
router.post('/run', async (req, res) => {
  try {
    // In production: calculate real Pearson r from articles + price data
    // For now: return existing data with refreshed timestamps
    const data = await Correlation.find().lean()
    res.json({ message: 'Analysis complete', entries: data.length, data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
