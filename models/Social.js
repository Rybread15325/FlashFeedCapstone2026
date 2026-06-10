import mongoose from 'mongoose'

const SocialSchema = new mongoose.Schema({
  post_id:    { type: String, required: true, unique: true },
  platform:   { type: String, enum: ['reddit','twitter','stocktwits','bluesky'], index: true },
  author:     String,
  content:    { type: String, required: true },
  created_at: { type: Date, required: true, index: true },
  ticker:     { type: String, index: true, sparse: true },
  sentiment:  { type: Number, min: -1, max: 1 },
  url:        String,
}, { timestamps: true })

SocialSchema.index({ platform: 1, created_at: -1 })
SocialSchema.index({ ticker: 1, created_at: -1 })

// Auto-delete posts older than 7 days
SocialSchema.index({ created_at: 1 }, { expireAfterSeconds: 604800 })

export default mongoose.model('Social', SocialSchema)
