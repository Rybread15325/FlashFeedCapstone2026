export interface Article {
  id:             string
  article_id?:    string
  title:          string
  source:         string
  category?:      string | null
  publish_date:   number
  ticker?:        string | null
  company?:       string | null
  sentiment?:     'bullish' | 'bearish' | 'neutral' | null
  ml_confidence?: number | null
  url?:           string
  content?:       string
}

export interface ScreenerRow {
  ticker:               string
  company:              string
  price:                number
  change_pct:           number
  volume:               number
  market_cap?:          number
  sector?:              string
  industry?:            string
  avg_sentiment:        number
  social_sentiment:     number
  structured_sentiment: number
  message_count:        number
}

export interface SocialPost {
  id?:        string
  post_id?:   string
  platform:   'reddit' | 'twitter' | 'stocktwits' | 'bluesky'
  author:     string
  content:    string
  created_at: string
  ticker?:    string | null
  sentiment?: number | null
  url?:       string
}

export interface CorrelationEntry {
  ticker:      string
  correlation: number
  p_value:     number
  sample_size: number
}
