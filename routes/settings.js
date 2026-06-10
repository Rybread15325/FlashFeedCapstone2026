import { Router } from 'express'

const router  = Router()
let settings  = { refreshInterval: 60, sentimentThreshold: 0.2 }

router.get('/',  (req, res) => res.json(settings))
router.post('/', (req, res) => {
  settings = { ...settings, ...req.body }
  res.json({ ok: true, settings })
})

export default router