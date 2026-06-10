import 'dotenv/config'
import express from 'express'
import cors    from 'cors'
import { connectDB } from './db.js'

import articlesRouter    from './routes/articles.js'
import screenerRouter    from './routes/screener.js'
import socialRouter      from './routes/social.js'
import correlationRouter from './routes/correlation.js'
import settingsRouter    from './routes/settings.js'
import fetchRouter       from './routes/fetch.js'

const app  = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173']
}))
app.use(express.json({ limit: '2mb' }))

app.use('/api/articles',    articlesRouter)
app.use('/api/screener',    screenerRouter)
app.use('/api/social',      socialRouter)
app.use('/api/correlation', correlationRouter)
app.use('/api/settings',    settingsRouter)
app.use('/api',             fetchRouter)

app.get('/api/health', async (req, res) => {
  const { default: mongoose } = await import('mongoose')
  const states = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' }
  res.json({ status: 'ok', db: states[mongoose.connection.readyState] })
})

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  ⚡ FlashFeed API running → http://localhost:${PORT}\n`)
  })
})