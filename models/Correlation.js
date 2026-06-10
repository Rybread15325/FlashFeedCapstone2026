import mongoose from 'mongoose'

const CorrelationSchema = new mongoose.Schema({
  ticker:        { type: String, required: true, index: true },
  correlation:   { type: Number, required: true, min: -1, max: 1 },
  p_value:       { type: Number },
  sample_size:   { type: Number },
  updated_at:    { type: Date, default: Date.now, index: true },
}, {
  timestamps: true,
})

CorrelationSchema.index({ ticker: 1, updated_at: -1 })

export default mongoose.model('Correlation', CorrelationSchema)

