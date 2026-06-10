import mongoose from 'mongoose'

const ScreenerSchema = new mongoose.Schema({
  ticker:               { type: String, required: true, unique: true, index: true },
  company:              String,
  sector:               String,
  industry:             String,
  price:                Number,
  change_pct:           Number,
  volume:               Number,
  market_cap:           Number,
  avg_sentiment:        { type: Number, default: 0 },
  structured_sentiment: { type: Number, default: 0 },
  social_sentiment:     { type: Number, default: 0 },
  message_count:        { type: Number, default: 0 },
  news_article_count:   { type: Number, default: 0 },
  updated_at:           { type: Date, default: Date.now, index: true },
}, { timestamps: true })

// Auto-delete stale screener data after 24 hours
ScreenerSchema.index({ updated_at: 1 }, { expireAfterSeconds: 86400 })

export default mongoose.model('Screener', ScreenerSchema)
