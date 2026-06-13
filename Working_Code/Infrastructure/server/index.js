import 'dotenv/config'
import express from 'express'
import mongoose from 'mongoose'
import cors    from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectDB } from './db.js'

import articlesRouter    from './routes/articles.js'
import screenerRouter    from './routes/screener.js'
import socialRouter      from './routes/social.js'
import correlationRouter from './routes/correlation.js'
import settingsRouter    from './routes/settings.js'

const app  = express()
const PORT = process.env.PORT || 3001
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SERVER_DIR, '../..')
const MARKET_WINDOW_TIME_ZONE = process.env.MARKET_WINDOW_TIMEZONE || 'America/New_York'
const MARKET_WINDOW_CLOSE_HOUR = Number(process.env.MARKET_WINDOW_CLOSE_HOUR_ET || 17)
const TRACKED_TICKER_FILE_CANDIDATES = [
  path.join(process.cwd(), 'config', 'social_tickers_100.txt'),
  path.join(PROJECT_ROOT, 'config', 'social_tickers_100.txt'),
  path.join(SERVER_DIR, 'config', 'social_tickers_100.txt'),
]
const TRACKED_TICKER_LIMIT = Math.max(1, Number(process.env.TRACKED_TICKER_LIMIT || process.env.SOCIAL_MAX_TICKERS || 250))
const NON_STOCK_TICKERS = new Set([
  "BTC", "ETH", "LTC", "DOGE", "SOL", "ADA", "XRP", "BNB", "DOT", "AVAX",
  "MATIC", "SHIB", "TRX", "BCH", "LINK", "ATOM", "UNI", "ETC", "FIL",
  "USD", "USDT", "USDC", "SPOT",
])
const PRIVATE_TRACKED_TICKERS = new Set(['SPACEX'])

// ── Middleware ────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
app.use(express.json({ limit: '2mb' }))

const SUPPORTED_TRANSLATION_LANGUAGES = new Set(["en", "es", "fr", "de", "pt", "ja"])

const FINANCE_GLOSSARY = {
  en: [
    ["informa que", "reports that"],
    ["sus activos totales", "its total assets"],
    ["ascienden a", "amount to"],
    ["millones de dolares", "million dollars"],
    ["millones de dólares", "million dollars"],
    ["acciones", "stocks"],
    ["accion", "stock"],
    ["acción", "stock"],
    ["mercado bursatil", "stock market"],
    ["mercado bursátil", "stock market"],
    ["mercado de acoes", "stock market"],
    ["mercado de ações", "stock market"],
    ["ingresos", "revenue"],
    ["receita", "revenue"],
    ["chiffre d'affaires", "revenue"],
    ["umsatz", "revenue"],
    ["resultados", "earnings"],
    ["resultats", "earnings"],
    ["résultats", "earnings"],
    ["gewinne", "earnings"],
    ["ganancia", "profit"],
    ["lucro", "profit"],
    ["benefice", "profit"],
    ["bénéfice", "profit"],
    ["gewinn", "profit"],
    ["perdida", "loss"],
    ["pérdida", "loss"],
    ["perte", "loss"],
    ["verlust", "loss"],
    ["fusion", "merger"],
    ["fusión", "merger"],
    ["fusao", "merger"],
    ["fusão", "merger"],
    ["gappei", "merger"],
    ["adquisicion", "acquisition"],
    ["adquisición", "acquisition"],
    ["aquisicao", "acquisition"],
    ["aquisição", "acquisition"],
    ["ubernahme", "acquisition"],
    ["übernahme", "acquisition"],
    ["prevision", "guidance"],
    ["previsión", "guidance"],
    ["previsions", "guidance"],
    ["prévisions", "guidance"],
    ["projecao", "guidance"],
    ["projeção", "guidance"],
    ["ausblick", "guidance"],
    ["dividendo", "dividend"],
    ["dividende", "dividend"],
    ["inflacion", "inflation"],
    ["inflación", "inflation"],
    ["inflacao", "inflation"],
    ["inflação", "inflation"],
    ["mercado", "market"],
    ["marche", "market"],
    ["marché", "market"],
    ["markt", "market"],
    ["preco", "price"],
    ["preço", "price"],
    ["precio", "price"],
    ["prix", "price"],
    ["preis", "price"],
    ["sube", "rises"],
    ["sobe", "rises"],
    ["steigt", "rises"],
    ["cae", "falls"],
    ["cai", "falls"],
    ["baisse", "falls"],
    ["fallt", "falls"],
    ["fällt", "falls"],
    ["supera", "beats"],
    ["depasse", "beats"],
    ["dépasse", "beats"],
    ["ubertrifft", "beats"],
    ["übertrifft", "beats"],
  ],
  es: [
    ["stock market", "mercado bursatil"],
    ["stocks", "acciones"],
    ["stock", "accion"],
    ["shares", "acciones"],
    ["earnings", "resultados"],
    ["revenue", "ingresos"],
    ["profit", "ganancia"],
    ["loss", "perdida"],
    ["merger", "fusion"],
    ["acquisition", "adquisicion"],
    ["upgrade", "mejora"],
    ["downgrade", "rebaja"],
    ["guidance", "prevision"],
    ["dividend", "dividendo"],
    ["inflation", "inflacion"],
    ["market", "mercado"],
    ["price", "precio"],
    ["rally", "repunte"],
    ["falls", "cae"],
    ["rises", "sube"],
    ["beats", "supera"],
    ["misses", "no alcanza"],
  ],
  fr: [
    ["stock market", "marche boursier"],
    ["stocks", "actions"],
    ["stock", "action"],
    ["shares", "actions"],
    ["earnings", "resultats"],
    ["revenue", "chiffre d'affaires"],
    ["profit", "benefice"],
    ["loss", "perte"],
    ["merger", "fusion"],
    ["acquisition", "acquisition"],
    ["upgrade", "relevement"],
    ["downgrade", "abaissement"],
    ["guidance", "previsions"],
    ["dividend", "dividende"],
    ["inflation", "inflation"],
    ["market", "marche"],
    ["price", "prix"],
    ["rally", "rebond"],
    ["falls", "baisse"],
    ["rises", "monte"],
    ["beats", "depasse"],
    ["misses", "rate"],
  ],
  de: [
    ["stock market", "aktienmarkt"],
    ["stocks", "aktien"],
    ["stock", "aktie"],
    ["shares", "anteile"],
    ["earnings", "gewinne"],
    ["revenue", "umsatz"],
    ["profit", "gewinn"],
    ["loss", "verlust"],
    ["merger", "fusion"],
    ["acquisition", "ubernahme"],
    ["upgrade", "heraufstufung"],
    ["downgrade", "herabstufung"],
    ["guidance", "ausblick"],
    ["dividend", "dividende"],
    ["inflation", "inflation"],
    ["market", "markt"],
    ["price", "preis"],
    ["rally", "rallye"],
    ["falls", "fallt"],
    ["rises", "steigt"],
    ["beats", "ubertrifft"],
    ["misses", "verfehlt"],
  ],
  pt: [
    ["stock market", "mercado de acoes"],
    ["stocks", "acoes"],
    ["stock", "acao"],
    ["shares", "acoes"],
    ["earnings", "resultados"],
    ["revenue", "receita"],
    ["profit", "lucro"],
    ["loss", "perda"],
    ["merger", "fusao"],
    ["acquisition", "aquisicao"],
    ["upgrade", "elevacao"],
    ["downgrade", "rebaixamento"],
    ["guidance", "projecao"],
    ["dividend", "dividendo"],
    ["inflation", "inflacao"],
    ["market", "mercado"],
    ["price", "preco"],
    ["rally", "alta"],
    ["falls", "cai"],
    ["rises", "sobe"],
    ["beats", "supera"],
    ["misses", "fica abaixo"],
  ],
  ja: [
    ["stock market", "kabushiki shijo"],
    ["stocks", "kabushiki"],
    ["stock", "kabushiki"],
    ["shares", "kabushiki"],
    ["earnings", "gyoseki"],
    ["revenue", "uriage"],
    ["profit", "rieki"],
    ["loss", "sonshitsu"],
    ["merger", "gappei"],
    ["acquisition", "baishu"],
    ["upgrade", "kakuzuke hikiage"],
    ["downgrade", "kakuzuke hikisage"],
    ["guidance", "gyoseki yosou"],
    ["dividend", "haito"],
    ["inflation", "infure"],
    ["market", "shijo"],
    ["price", "kakaku"],
    ["rally", "joraku"],
    ["falls", "geraku"],
    ["rises", "josho"],
    ["beats", "uwamawaru"],
    ["misses", "shitamawaru"],
  ],
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function glossaryTranslate(text, targetLanguage) {
  const glossary = FINANCE_GLOSSARY[targetLanguage] || []
  let translated = String(text || "")

  if (targetLanguage === "en") {
    translated = englishFallbackTranslate(translated)
  }

  for (const [source, target] of glossary) {
    translated = translated.replace(new RegExp(`\\b${escapeRegExp(source)}\\b`, "gi"), target)
  }

  return translated
}

const ENGLISH_DIRECT_TRANSLATIONS = [
  [
    /Huasun belegt den 12\. Platz der TIME-Liste der weltweit führenden GreenTech-Unternehmen 2026 und verbessert sich dank seines Engagements für die HJT-Technologie um 22 Plätze/i,
    "Huasun ranks 12th on TIME's 2026 list of the world's leading GreenTech companies and rises 22 places thanks to its commitment to HJT technology",
  ],
]

const ENGLISH_PHRASE_FALLBACKS = [
  ["belegt den", "ranks"],
  ["Platz der", "place on the"],
  ["TIME-Liste", "TIME list"],
  ["weltweit führenden", "world's leading"],
  ["GreenTech-Unternehmen", "GreenTech companies"],
  ["verbessert sich", "rises"],
  ["dank seines Engagements", "thanks to its commitment"],
  ["für die", "to the"],
  ["Technologie", "technology"],
  ["Plätze", "places"],
  ["Juni", "June"],
  ["Unternehmen", "company"],
  ["weltweit", "worldwide"],
  ["führenden", "leading"],
  ["Umsatz", "revenue"],
  ["Gewinn", "profit"],
  ["Verlust", "loss"],
  ["Aktien", "shares"],
  ["Markt", "market"],
  ["Prix", "price"],
  ["marché", "market"],
  ["résultats", "earnings"],
  ["acciones", "stocks"],
  ["mercado", "market"],
  ["ingresos", "revenue"],
  ["receita", "revenue"],
  ["ações", "stocks"],
]

function likelyNeedsEnglishFallback(text) {
  return /[äöüßéèêàáíóúñçãõ]|(?:\b(?:der|die|das|und|für|mit|von|belegt|verbessert|weltweit|führenden|acciones|mercado|ingresos|résultats|marché|receita|ações)\b)/i.test(text)
}

function englishFallbackTranslate(text) {
  const original = String(text || "")

  for (const [pattern, translation] of ENGLISH_DIRECT_TRANSLATIONS) {
    if (pattern.test(original)) return translation
  }

  if (!likelyNeedsEnglishFallback(original)) return original

  let translated = original
  for (const [source, target] of ENGLISH_PHRASE_FALLBACKS) {
    translated = translated.replace(new RegExp(escapeRegExp(source), "gi"), target)
  }

  translated = translated
    .replace(/\bden\b/gi, "the")
    .replace(/\bder\b/gi, "of the")
    .replace(/\bdie\b/gi, "the")
    .replace(/\bdas\b/gi, "the")
    .replace(/\bund\b/gi, "and")
    .replace(/\bum\b/gi, "by")
    .replace(/\bauf\b/gi, "on")
    .replace(/\bin\b/gi, "in")
    .replace(/\bmit\b/gi, "with")

  return translated === original ? `English translation pending: ${original}` : translated
}

async function translateWithProvider(text, targetLanguage) {
  const url = process.env.TRANSLATION_API_URL
  if (!url || typeof fetch !== "function") return null

  const body = {
    q: text,
    text,
    source: "auto",
    target: targetLanguage,
    target_language: targetLanguage,
    format: "text",
  }

  if (process.env.TRANSLATION_API_KEY) {
    body.api_key = process.env.TRANSLATION_API_KEY
    body.apiKey = process.env.TRANSLATION_API_KEY
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`translation provider returned HTTP ${response.status}`)
  }

  const data = await response.json()
  return data.translatedText || data.translated_text || data.translation || data.text || null
}

function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_WINDOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  return Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  )
}

function easternLocalToUtc(year, month, day, hour, minute = 0, second = 0) {
  const target = Date.UTC(year, month - 1, day, hour, minute, second)
  let guess = target

  for (let i = 0; i < 4; i += 1) {
    const parts = easternParts(new Date(guess))
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
    const diff = target - actual
    if (diff === 0) break
    guess += diff
  }

  return new Date(guess)
}

function shiftLocalDate(year, month, day, deltaDays) {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function localWeekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function latestMarketCloseCutoff(now = new Date()) {
  let { year, month, day, hour } = easternParts(now)
  let weekday = localWeekday(year, month, day)

  if (weekday === 0) {
    ;({ year, month, day } = shiftLocalDate(year, month, day, -2))
  } else if (weekday === 6) {
    ;({ year, month, day } = shiftLocalDate(year, month, day, -1))
  } else if (hour < MARKET_WINDOW_CLOSE_HOUR) {
    ;({ year, month, day } = shiftLocalDate(year, month, day, -1))
    while ([0, 6].includes(localWeekday(year, month, day))) {
      ;({ year, month, day } = shiftLocalDate(year, month, day, -1))
    }
  }

  return easternLocalToUtc(year, month, day, MARKET_WINDOW_CLOSE_HOUR)
}

function articleWindowMatch(cutoffMs) {
  const cutoffSec = Math.floor(cutoffMs / 1000)
  const cutoffDate = new Date(cutoffMs)
  const missingPublishDate = {
    $or: [
      { publish_date: { $exists: false } },
      { publish_date: null },
      { publish_date: "" },
    ],
  }

  return {
    $or: [
      { publish_date: { $type: "date", $gte: cutoffDate } },
      { publish_date: { $type: "int", $gte: cutoffSec } },
      { publish_date: { $type: "long", $gte: cutoffSec } },
      { publish_date: { $type: "double", $gte: cutoffSec } },
      {
        $and: [
          missingPublishDate,
          {
            $or: [
              { fetched_date: { $type: "date", $gte: cutoffDate } },
              { fetched_date: { $type: "int", $gte: cutoffSec } },
              { fetched_date: { $type: "long", $gte: cutoffSec } },
              { fetched_date: { $type: "double", $gte: cutoffSec } },
              { detected_at: { $type: "date", $gte: cutoffDate } },
              { detected_at: { $type: "int", $gte: cutoffSec } },
              { detected_at: { $type: "long", $gte: cutoffSec } },
              { detected_at: { $type: "double", $gte: cutoffSec } },
              { createdAt: { $gte: cutoffDate } },
            ],
          },
        ],
      },
    ],
  }
}

function recentArticleMatch(days = 0) {
  const n = Number(days || 0)
  const cutoffMs = Number.isFinite(n) && n > 0
    ? Date.now() - n * 86_400_000
    : latestMarketCloseCutoff().getTime()

  return articleWindowMatch(cutoffMs)
}

function articleMatchStage(match) {
  return Object.keys(match).length ? [{ $match: match }] : []
}

function tickerArticlePipeline({ days = 2, limit = 150, ticker = "" } = {}) {
  const match = {
    ...recentArticleMatch(days),
    ticker: { $exists: true, $nin: ["", null] },
  }

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        _ticker_parts: {
          $map: {
            input: { $split: [{ $toUpper: { $toString: "$ticker" } }, ","] },
            as: "ticker_part",
            in: { $trim: { input: "$$ticker_part" } }
          }
        }
      }
    },
    { $unwind: "$_ticker_parts" },
    { $match: { _ticker_parts: { $ne: "", $nin: Array.from(NON_STOCK_TICKERS) } } },
  ]

  if (ticker) pipeline.push({ $match: { _ticker_parts: String(ticker).toUpperCase() } })

  pipeline.push(
    {
      $addFields: {
        _article_kind: {
          $cond: [
            {
              $or: [
                { $in: ["$category", ["unstructured_public_title", "public_news", "public_market_news"]] },
                { $eq: ["$collector", "unstructured_news_title_only_v1"] },
                {
                  $regexMatch: {
                    input: { $toLower: { $toString: { $ifNull: ["$source", ""] } } },
                    regex: "unstructured"
                  }
                },
              ],
            },
            "unstructured",
            "structured",
          ],
        },
      },
    },
    {
      $group: {
        _id: "$_ticker_parts",
        count: { $sum: 1 },
        structured_count: { $sum: { $cond: [{ $eq: ["$_article_kind", "structured"] }, 1, 0] } },
        unstructured_count: { $sum: { $cond: [{ $eq: ["$_article_kind", "unstructured"] }, 1, 0] } },
        bullish: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bullish"] }, 1, 0] }
        },
        bearish: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bearish"] }, 1, 0] }
        },
        neutral: {
          $sum: { $cond: [{ $eq: [{ $toLower: { $ifNull: ["$sentiment", "neutral"] } }, "neutral"] }, 1, 0] }
        },
        structured_bullish: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "structured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bullish"] }] }, 1, 0] }
        },
        structured_bearish: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "structured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bearish"] }] }, 1, 0] }
        },
        structured_neutral: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "structured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", "neutral"] } }, "neutral"] }] }, 1, 0] }
        },
        unstructured_bullish: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "unstructured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bullish"] }] }, 1, 0] }
        },
        unstructured_bearish: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "unstructured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", ""] } }, "bearish"] }] }, 1, 0] }
        },
        unstructured_neutral: {
          $sum: { $cond: [{ $and: [{ $eq: ["$_article_kind", "unstructured"] }, { $eq: [{ $toLower: { $ifNull: ["$sentiment", "neutral"] } }, "neutral"] }] }, 1, 0] }
        },
        sources: { $addToSet: "$source" },
        latest_publish: { $max: "$publish_date" },
        latest_fetch: { $max: "$fetched_date" }
      }
    },
    { $sort: { count: -1, latest_publish: -1 } },
    { $limit: Math.max(1, Math.min(300, Number(limit || 150))) },
    {
      $project: {
        _id: 0,
        ticker: "$_id",
        count: 1,
        structured_count: 1,
        unstructured_count: 1,
        bullish: 1,
        bearish: 1,
        neutral: 1,
        structured_bullish: 1,
        structured_bearish: 1,
        structured_neutral: 1,
        unstructured_bullish: 1,
        unstructured_bearish: 1,
        unstructured_neutral: 1,
        sources: 1,
        latest_publish: 1,
        latest_fetch: 1
      }
    }
  )

  return pipeline
}

function sentimentScore(row) {
  const hasArticleKinds = row.structured_count != null || row.unstructured_count != null
  if (hasArticleKinds) {
    const structuredWeight = 2
    const unstructuredWeight = 1
    const structuredCount = Number(row.structured_count || 0)
    const unstructuredCount = Number(row.unstructured_count || 0)
    const numerator =
      structuredWeight * (Number(row.structured_bullish || 0) - Number(row.structured_bearish || 0)) +
      unstructuredWeight * (Number(row.unstructured_bullish || 0) - Number(row.unstructured_bearish || 0))
    const denominator = structuredWeight * structuredCount + unstructuredWeight * unstructuredCount
    return denominator ? Number((numerator / (denominator + 4)).toFixed(3)) : 0
  }

  const total = Math.max(1, Number(row.count || 0))
  const priorNeutralWeight = 4
  return Number((((row.bullish || 0) - (row.bearish || 0)) / (total + priorNeutralWeight)).toFixed(3))
}

function kindSentimentScore(row, kind) {
  const prefix = kind === "unstructured" ? "unstructured" : "structured"
  const count = Number(row?.[`${prefix}_count`] || 0)
  if (!count) return 0
  return Number(((Number(row?.[`${prefix}_bullish`] || 0) - Number(row?.[`${prefix}_bearish`] || 0)) / (count + 2)).toFixed(3))
}

function stableHash(value) {
  let hash = 0
  const text = String(value || "")
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function derivedNumber(ticker, min, max, decimals = 2, salt = "") {
  const span = max - min
  const pct = (stableHash(`${ticker}:${salt}`) % 10000) / 10000
  return Number((min + span * pct).toFixed(decimals))
}

function nullableNumber(value) {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function nullableFixed(value, decimals = 2) {
  const n = nullableNumber(value)
  return n == null ? null : Number(n.toFixed(decimals))
}

function marketCapBucket(marketCap) {
  const cap = Number(marketCap || 0)
  if (cap >= 200e9) return "Mega"
  if (cap >= 10e9) return "Large"
  if (cap >= 2e9) return "Mid"
  if (cap >= 300e6) return "Small"
  if (cap > 0) return "Micro"
  return "Unknown"
}

function normalizeScreenerDoc(doc = {}) {
  const ticker = String(doc.ticker || "").toUpperCase()
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
    company: doc.company || "",
    price,
    change_pct: changePct,
    volume,
    avg_volume: avgVolume,
    rel_volume: relVolume,
    market_cap: marketCap,
    market_cap_bucket: marketCapBucket(marketCap),
    sector: doc.sector || "Unclassified",
    industry: doc.industry || "Unclassified",
    country: doc.country || "",
    exchange: doc.exchange || "",
    index: doc.index || "",
    avg_sentiment: avgSentiment,
    social_sentiment: Number(doc.social_sentiment ?? 0),
    structured_sentiment: Number(doc.structured_sentiment ?? doc.news_sentiment ?? avgSentiment),
    sentiment: avgSentiment,
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
    change: nullableFixed(doc.change, 2),
    quote_source: doc.quote_source || null,
    quote_time: doc.quote_time || null,
    quote_updated_at: doc.quote_updated_at || null,
    quote_status: doc.quote_status || (hasStoredPrice ? "priced" : "missing"),
  }
}

function tickerStatsToScreenerRow(row, quoteRow = {}) {
  const score = sentimentScore(row)
  const quote = normalizeScreenerDoc({ ...quoteRow, ticker: quoteRow.ticker || row.ticker })
  const price = quote.price
  const volume = quote.quote_status === "priced" ? quote.volume : null
  return normalizeScreenerDoc({
    ...quote,
    ticker: row.ticker,
    company: quote.company || "",
    price,
    change_pct: quote.change_pct,
    volume,
    avg_volume: quote.quote_status === "priced" ? quote.avg_volume : null,
    market_cap: quote.market_cap,
    sector: quote.quote_status === "priced" ? quote.sector : "News matched",
    industry: quote.quote_status === "priced" ? quote.industry : "Ticker mentions",
    avg_sentiment: score,
    social_sentiment: quote.social_sentiment || 0,
    structured_sentiment: score,
    message_count: row.count || 0,
    news_article_count: row.count || 0,
    bullish_count: row.bullish || 0,
    bearish_count: row.bearish || 0,
    neutral_count: row.neutral || 0,
    sources: (row.sources || []).filter(Boolean).slice(0, 6),
    latest_publish: row.latest_publish,
    latest_fetch: row.latest_fetch,
  })
}

function tickerStatsToMomentumRow(row, quoteRow = {}) {
  const score = sentimentScore(row)
  const base = tickerStatsToScreenerRow(row, quoteRow)
  const volume = base.volume
  const articleCount = row.count || 0
  return {
    ...base,
    ticker: row.ticker,
    volume,
    avg_volume: base.avg_volume,
    rel_volume: base.rel_volume,
    sentiment: score,
    article_count: articleCount,
    message_count: articleCount,
    bullish_count: row.bullish || 0,
    bearish_count: row.bearish || 0,
    neutral_count: row.neutral || 0,
    sources: (row.sources || []).filter(Boolean).slice(0, 6),
    latest_publish: row.latest_publish,
    latest_fetch: row.latest_fetch,
    momentum_score: Number(Math.abs(base.change_pct || 0).toFixed(2)),
  }
}

function timeLabel(value) {
  const raw = Number(value || 0)
  const ms = raw > 1000000000000 ? raw : raw > 1000000000 ? raw * 1000 : Date.parse(value)
  if (!Number.isFinite(ms) || ms <= 0) return ""
  const diff = Math.max(0, Date.now() - ms)
  if (diff < 60_000) return "now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function normalizeTickerList(values = [], limit = TRACKED_TICKER_LIMIT, { ensurePrivate = true } = {}) {
  const max = Math.max(1, Number(limit || TRACKED_TICKER_LIMIT))
  const tickers = []
  const seen = new Set()

  const addTicker = (raw) => {
    const ticker = String(raw || "").trim().toUpperCase()
    if (!ticker || seen.has(ticker)) return
    if (!PRIVATE_TRACKED_TICKERS.has(ticker) && !/^[A-Z][A-Z0-9.-]{0,5}$/.test(ticker)) return
    tickers.push(ticker)
    seen.add(ticker)
  }

  for (const ticker of values) addTicker(ticker)
  if (ensurePrivate) {
    for (const ticker of PRIVATE_TRACKED_TICKERS) {
      if (!seen.has(ticker)) tickers.unshift(ticker)
    }
  }

  return tickers.slice(0, max)
}

function loadTrackedTickers(limit = TRACKED_TICKER_LIMIT) {
  const configured = process.env.TRACKED_TICKERS || ""
  if (configured.trim()) {
    return normalizeTickerList(configured.split(","), limit)
  }

  const configuredFile = process.env.TRACKED_TICKER_FILE || process.env.SOCIAL_TICKER_FILE || ""
  const candidates = configuredFile
    ? [path.isAbsolute(configuredFile) ? configuredFile : path.resolve(process.cwd(), configuredFile)]
    : TRACKED_TICKER_FILE_CANDIDATES

  for (const filePath of candidates) {
    try {
      const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/)
      const tickers = normalizeTickerList(lines, limit)
      if (tickers.length > 1) return tickers
    } catch {
      // Try the next known runtime layout.
    }
  }

  console.warn("Could not read tracked ticker file from known paths:", candidates.join(", "))
  return normalizeTickerList(["SPACEX"], limit)
}

async function loadArticleStats(db, days = 0) {
  const articles = db.collection("articles")
  const match = recentArticleMatch(days)
  const trackedTickers = loadTrackedTickers()

  const [sources, categories, sentimentRows, tickerRows, total, totalAll] = await Promise.all([
    articles.aggregate([
      ...articleMatchStage(match),
      { $group: { _id: "$source", count: { $sum: 1 } } },
      { $project: { _id: 0, source: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray(),
    articles.aggregate([
      ...articleMatchStage(match),
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $project: { _id: 0, category: "$_id", count: 1 } },
      { $sort: { count: -1 } }
    ]).toArray(),
    articles.aggregate([
      ...articleMatchStage(match),
      {
        $group: {
          _id: { $toLower: { $ifNull: ["$sentiment", "neutral"] } },
          count: { $sum: 1 }
        }
      }
    ]).toArray(),
    articles.aggregate(tickerArticlePipeline({ days, limit: 150 })).toArray(),
    articles.countDocuments(match),
    articles.countDocuments({})
  ])

  const sentiment = { bullish: 0, bearish: 0, neutral: 0, unknown: 0 }
  for (const row of sentimentRows) {
    const key = sentiment[row._id] == null ? "unknown" : row._id
    sentiment[key] = (sentiment[key] || 0) + row.count
  }

  return {
    total,
    total_recent: total,
    total_all: totalAll,
    sources,
    categories,
    sentiment,
    ticker_mentions: tickerRows,
    tracked_ticker_count: trackedTickers.length,
    tracked_tickers: trackedTickers,
  }
}

async function loadScreenerQuoteMap(db, tickers = []) {
  const unique = Array.from(new Set(tickers.map(t => String(t || "").toUpperCase()).filter(Boolean)))
  if (!unique.length) return new Map()

  const docs = await db.collection("screeners").find({ ticker: { $in: unique } }).toArray()
  return new Map(docs.map(doc => [String(doc.ticker || "").toUpperCase(), normalizeScreenerDoc(doc)]))
}

async function loadAllScreenerRows(db) {
  const docs = await db.collection("screeners").find({}).toArray()
  return docs.map(normalizeScreenerDoc).filter(row => row.ticker)
}

async function loadPositiveFinvizMoverRows(db, limit = 100) {
  const requestedLimit = Math.max(1, Math.min(300, Number(limit || 100)))
  const docs = await db.collection("screeners").find({}).toArray()
  return docs
    .map(normalizeScreenerDoc)
    .filter(row => row.ticker && Number(row.change_pct || 0) >= 0.01)
    .sort((a, b) => {
      const changeDiff = Number(b.change_pct || 0) - Number(a.change_pct || 0)
      if (changeDiff !== 0) return changeDiff
      const relDiff = Number(b.rel_volume || 0) - Number(a.rel_volume || 0)
      if (relDiff !== 0) return relDiff
      return Number(b.volume || 0) - Number(a.volume || 0)
    })
    .slice(0, requestedLimit)
    .map((row, index) => ({
      ...row,
      finviz_rank: index + 1,
      discovery_source: "positive_price_change",
      positive_mover: true,
      sentiment: row.avg_sentiment || 0,
      article_count: row.news_article_count || 0,
      momentum_score: Number((row.change_pct || 0).toFixed(2)),
    }))
}

async function loadArticleStatsForTickers(db, tickers = [], days = 2) {
  const wanted = new Set(tickers.map(t => String(t || "").toUpperCase()).filter(Boolean))
  if (!wanted.size) return new Map()

  const rows = await db.collection("articles")
    .aggregate(tickerArticlePipeline({ days, limit: Math.max(wanted.size * 4, 150) }))
    .toArray()

  return new Map(
    rows
      .filter(row => wanted.has(String(row.ticker || "").toUpperCase()))
      .map(row => [String(row.ticker || "").toUpperCase(), row])
  )
}

async function loadSocialStatsForTickers(db, tickers = [], windowMinutes = 1440) {
  const wanted = normalizeTickerList(tickers, 300, { ensurePrivate: false })
  if (!wanted.length) return new Map()

  const sinceSec = Math.floor(Date.now() / 1000) - Math.max(1, Number(windowMinutes || 1440)) * 60
  const rows = await db.collection("socials").aggregate([
    ...socialTimeStages(),
    { $match: { _event_sec: { $gte: sinceSec } } },
    {
      $addFields: {
        _ticker_key: {
          $toUpper: {
            $ifNull: [
              "$ticker",
              { $ifNull: ["$symbol", ""] }
            ]
          }
        },
      },
    },
    { $match: { _ticker_key: { $in: wanted } } },
    {
      $group: {
        _id: "$_ticker_key",
        count: { $sum: 1 },
        bullish: {
          $sum: {
            $cond: [
              { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bull|positive" } },
              1,
              0,
            ],
          },
        },
        bearish: {
          $sum: {
            $cond: [
              { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bear|negative" } },
              1,
              0,
            ],
          },
        },
        avg_sentiment_score: {
          $avg: {
            $switch: {
              branches: [
                {
                  case: { $in: [{ $type: "$sentiment_score" }, ["int", "long", "double", "decimal"] ] },
                  then: { $toDouble: "$sentiment_score" },
                },
                {
                  case: { $in: [{ $type: "$sentiment" }, ["int", "long", "double", "decimal"] ] },
                  then: { $toDouble: "$sentiment" },
                },
                {
                  case: { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bull|positive" } },
                  then: 1,
                },
                {
                  case: { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bear|negative" } },
                  then: -1,
                },
              ],
              default: 0,
            },
          },
        },
        platforms: { $addToSet: "$_norm_platform" },
        latest_post: { $max: "$_event_sec" },
      },
    },
  ]).toArray()

  return new Map(rows.map(row => [String(row._id || "").toUpperCase(), row]))
}

function mergeMoverContext(row, articleRow, socialRow) {
  const newsSentiment = articleRow ? sentimentScore(articleRow) : 0
  const structuredArticleCount = Number(articleRow?.structured_count || 0)
  const unstructuredArticleCount = Number(articleRow?.unstructured_count || 0)
  const totalArticleCount = Number(articleRow?.count || row.news_article_count || 0)
  const structuredSentiment = articleRow ? kindSentimentScore(articleRow, "structured") : Number(row.structured_sentiment || 0)
  const unstructuredSentiment = articleRow ? kindSentimentScore(articleRow, "unstructured") : 0
  const socialCount = Number(socialRow?.count || 0)
  const socialSentiment = socialCount
    ? Number((Number.isFinite(Number(socialRow.avg_sentiment_score))
      ? Number(socialRow.avg_sentiment_score)
      : ((socialRow.bullish || 0) - (socialRow.bearish || 0)) / Math.max(1, socialCount)).toFixed(3))
    : 0
  const structuredWeight = 2
  const unstructuredWeight = 1
  const socialWeight = 0.75
  const sentimentDenominator =
    structuredArticleCount * structuredWeight +
    unstructuredArticleCount * unstructuredWeight +
    socialCount * socialWeight
  const sentiment = sentimentDenominator
    ? Number(((
      structuredSentiment * structuredArticleCount * structuredWeight +
      unstructuredSentiment * unstructuredArticleCount * unstructuredWeight +
      socialSentiment * socialCount * socialWeight
    ) / sentimentDenominator).toFixed(3))
    : Number(row.avg_sentiment || 0)

  return {
    ...row,
    sentiment,
    article_sentiment: newsSentiment,
    social_sentiment: socialSentiment,
    structured_sentiment: structuredSentiment,
    unstructured_sentiment: unstructuredSentiment,
    article_count: totalArticleCount,
    structured_article_count: structuredArticleCount,
    unstructured_article_count: unstructuredArticleCount,
    news_article_count: totalArticleCount,
    message_count: socialCount,
    bullish_count: Number(articleRow?.bullish || 0) + Number(socialRow?.bullish || 0),
    bearish_count: Number(articleRow?.bearish || 0) + Number(socialRow?.bearish || 0),
    neutral_count: Number(articleRow?.neutral || 0),
    sources: [
      "Positive Movers",
      ...(articleRow?.sources || []),
      ...(socialRow?.platforms || []),
    ].filter(Boolean).slice(0, 8),
    latest_social: socialRow?.latest_post || null,
    momentum_score: Number((row.change_pct || 0).toFixed(2)),
  }
}

async function loadTopMomentumTickerSymbols(db, limit = 10) {
  const requestedLimit = Math.max(1, Math.min(50, Number(limit || 10)))
  const movers = await loadPositiveFinvizMoverRows(db, requestedLimit)
  return normalizeTickerList(movers.map(row => row.ticker), requestedLimit, { ensurePrivate: false })
}

// ── Routes ────────────────────────────────────────────────
app.post("/api/translate", async (req, res) => {
  try {
    const text = String(req.body.text || "").trim().slice(0, 1200)
    const targetLanguage = String(req.body.target_language || req.body.target || "en").toLowerCase()

    if (!text) return res.status(400).json({ ok: false, error: "text is required" })
    if (!SUPPORTED_TRANSLATION_LANGUAGES.has(targetLanguage)) {
      return res.status(400).json({ ok: false, error: "unsupported target language" })
    }

    try {
      const providerTranslation = await translateWithProvider(text, targetLanguage)
      if (providerTranslation) {
        return res.json({
          ok: true,
          translated_text: providerTranslation,
          target_language: targetLanguage,
          provider: "external",
        })
      }
    } catch (err) {
      console.warn("Translation provider failed, using glossary fallback:", err.message)
    }

    return res.json({
      ok: true,
      translated_text: glossaryTranslate(text, targetLanguage),
      target_language: targetLanguage,
      provider: "glossary",
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.use('/api/articles',    articlesRouter)
app.use('/api/screener',    screenerRouter)

app.get("/api/momentum/trending", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, tickers: [], error: "MongoDB is not connected" })

    const days = Number(req.query.days || 2)
    const limit = Number(req.query.limit || 30)
    const movers = await loadPositiveFinvizMoverRows(db, Math.max(1, Math.min(100, limit)))
    const articleMap = await loadArticleStatsForTickers(db, movers.map(row => row.ticker), days)
    const socialMap = await loadSocialStatsForTickers(db, movers.map(row => row.ticker), 1440)
    const tickers = movers.map(row => mergeMoverContext(
      row,
      articleMap.get(row.ticker),
      socialMap.get(row.ticker)
    ))

    res.json({ ok: true, tickers, days, order: "positive_price_change", source: "Momentum movers" })
  } catch (err) {
    console.error("GET /api/momentum/trending failed:", err)
    res.status(500).json({ ok: false, tickers: [], error: String(err.message || err) })
  }
})

app.get("/api/momentum", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, tickers: [], error: "MongoDB is not connected" })

    const days = Number(req.query.days || 2)
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)))
    const minNews = Math.max(0, Number(req.query.min_volume || req.query.min_news || 0))
    const minRelVolume = Math.max(0, Number(req.query.min_rel_vol || 0))
    const maxPrice = req.query.max_price ? Number(req.query.max_price) : null
    const sentiment = String(req.query.sentiment || "").toLowerCase()
    const order = String(req.query.order || "absolute_momentum").toLowerCase()

    const movers = await loadPositiveFinvizMoverRows(db, Math.max(limit * 4, 100))
    const articleMap = await loadArticleStatsForTickers(db, movers.map(row => row.ticker), days)
    const socialMap = await loadSocialStatsForTickers(db, movers.map(row => row.ticker), 1440)
    let tickers = movers.map(row => mergeMoverContext(
      row,
      articleMap.get(row.ticker),
      socialMap.get(row.ticker)
    ))

    if (minNews > 0) tickers = tickers.filter(row => (row.article_count || row.message_count || 0) >= minNews)
    if (minRelVolume > 0) tickers = tickers.filter(row => (row.rel_volume || 0) >= minRelVolume)
    if (maxPrice != null && Number.isFinite(maxPrice)) {
      tickers = tickers.filter(row => row.price == null || row.price <= maxPrice)
    }
    if (sentiment === "bullish") tickers = tickers.filter(row => (row.sentiment || 0) > 0)
    if (sentiment === "bearish") tickers = tickers.filter(row => (row.sentiment || 0) < 0)

    tickers.sort((a, b) => {
      if (order === "news") {
        const scoreA = (a.article_count || a.message_count || 0) * (1 + Math.abs(a.sentiment || 0))
        const scoreB = (b.article_count || b.message_count || 0) * (1 + Math.abs(b.sentiment || 0))
        return scoreB - scoreA
      }
      const scoreA = Number(a.change_pct || 0)
      const scoreB = Number(b.change_pct || 0)
      if (scoreB !== scoreA) return scoreB - scoreA
      const relA = Number(a.rel_volume || 0)
      const relB = Number(b.rel_volume || 0)
      if (relB !== relA) return relB - relA
      return (b.volume || 0) - (a.volume || 0)
    })

    res.json({ ok: true, tickers: tickers.slice(0, limit), days, order, source: "Momentum movers" })
  } catch (err) {
    console.error("GET /api/momentum failed:", err)
    res.status(500).json({ ok: false, tickers: [], error: String(err.message || err) })
  }
})

app.get("/api/momentum/:ticker/details", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, headlines: [], posts: [], error: "MongoDB is not connected" })

    const ticker = String(req.params.ticker || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "")
    const match = {
      ...recentArticleMatch(Number(req.query.days || 2)),
      ticker: { $regex: `(^|,\\s*)${escapeRegExp(ticker)}(\\s*,|$)`, $options: "i" },
    }

    const articles = await db.collection("articles").find(
      match,
      { projection: { title: 1, source: 1, sentiment: 1, publish_date: 1, fetched_date: 1, url: 1, category: 1 } }
    ).sort({ publish_date: -1, fetched_date: -1 }).limit(12).toArray()

    const headlines = articles.map(article => ({
      title: article.title || "Untitled headline",
      source: article.source || "News",
      sentiment: article.sentiment || "neutral",
      time: timeLabel(article.publish_date || article.fetched_date),
      catalyst: article.category || undefined,
      url: article.url,
    }))

    const socialRows = await db.collection("socials").aggregate([
      ...socialTimeStages(),
      {
        $match: {
          $or: [
            { ticker },
            { symbol: ticker },
            { tickers_mentioned: ticker },
            { tickers_mentioned: { $elemMatch: { $eq: ticker } } },
          ],
        },
      },
      { $sort: { _event_sec: -1 } },
      { $limit: 12 },
      {
        $project: {
          _id: 0,
          platform: "$_norm_platform",
          author: 1,
          content: { $ifNull: ["$text", { $ifNull: ["$content", "$title"] }] },
          sentiment: 1,
          sentiment_score: 1,
          url: 1,
          fetched_at: "$_event_sec",
        },
      },
    ]).toArray()

    const posts = socialRows.map(post => ({
      platform: post.platform || "Social",
      author: post.author || "",
      content: post.content || "",
      sentiment: typeof post.sentiment_score === "number"
        ? post.sentiment_score
        : /bull|positive/i.test(String(post.sentiment || "")) ? 1
        : /bear|negative/i.test(String(post.sentiment || "")) ? -1
        : 0,
      url: post.url,
      time: timeLabel(post.fetched_at),
    }))

    res.json({ ok: true, ticker, headlines, posts })
  } catch (err) {
    console.error("GET /api/momentum/:ticker/details failed:", err)
    res.status(500).json({ ok: false, headlines: [], posts: [], error: String(err.message || err) })
  }
})

app.get("/api/prices/:ticker", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, error: "MongoDB is not connected" })

    const ticker = String(req.params.ticker || "").toUpperCase().replace(/[^A-Z0-9.-]/g, "")
    const doc = await db.collection("screeners").findOne({ ticker })
    const row = normalizeScreenerDoc(doc || { ticker })
    res.json({
      ok: true,
      ticker,
      price: row.price,
      change_pct: row.change_pct,
      volume: row.volume,
      rel_volume: row.rel_volume,
      previous_close: row.previous_close,
      quote_source: row.quote_source,
      quote_time: row.quote_time,
      quote_status: row.quote_status,
      updated_at: doc?.quote_updated_at || doc?.updated_at || doc?.updatedAt || null,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

// SOCIAL_ROLLING_API_V2_START
// Rolling social feed using existing Mongoose connection.
// Supports numeric Unix-second timestamps, JS Date timestamps, and fallback fields.
function socialTimeStages() {
  return [
    {
      $addFields: {
        _time_raw: {
          $ifNull: [
            "$fetched_at",
            { $ifNull: [
              "$detected_at",
              { $ifNull: [
                "$timestamp",
                { $ifNull: ["$created_at", "$publish_date"] }
              ] }
            ] }
          ]
        }
      }
    },
    {
      $addFields: {
        _event_sec: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $type: "$_time_raw" }, "date"] },
                then: { $floor: { $divide: [{ $toLong: "$_time_raw" }, 1000] } }
              },
              {
                case: { $in: [{ $type: "$_time_raw" }, ["int", "long", "double", "decimal"] ] },
                then: { $toLong: "$_time_raw" }
              },
              {
                case: { $eq: [{ $type: "$_time_raw" }, "string"] },
                then: {
                  $floor: {
                    $divide: [
                      { $toLong: { $dateFromString: { dateString: "$_time_raw", onError: new Date(0) } } },
                      1000
                    ]
                  }
                }
              }
            ],
            default: 0
          }
        }
      }
    },
    {
      $addFields: {
        _norm_platform: {
          $switch: {
            branches: [
              {
                case: {
                  $regexMatch: {
                    input: { $toLower: { $ifNull: ["$platform", ""] } },
                    regex: "stocktwits"
                  }
                },
                then: "StockTwits"
              },
              {
                case: {
                  $regexMatch: {
                    input: { $toLower: { $ifNull: ["$platform", ""] } },
                    regex: "bluesky|bsky"
                  }
                },
                then: "Bluesky"
              },
              {
                case: {
                  $or: [
                    {
                      $regexMatch: {
                        input: { $toLower: { $ifNull: ["$platform", ""] } },
                        regex: "reddit"
                      }
                    },
                    {
                      $regexMatch: {
                        input: { $toLower: { $ifNull: ["$collector", ""] } },
                        regex: "reddit"
                      }
                    }
                  ]
                },
                then: "Reddit"
              },
              {
                case: {
                  $or: [
                    {
                      $regexMatch: {
                        input: { $toLower: { $ifNull: ["$platform", ""] } },
                        regex: "twitter|x"
                      }
                    },
                    {
                      $regexMatch: {
                        input: { $toLower: { $ifNull: ["$collector", ""] } },
                        regex: "twitter|x_"
                      }
                    }
                  ]
                },
                then: "Twitter"
              }
            ],
            default: { $ifNull: ["$platform", "Unknown"] }
          }
        }
      }
    }
  ]
}

function marketSessionForSec(sec) {
  const date = new Date(Number(sec || 0) * 1000)
  if (!Number.isFinite(date.getTime())) return "unknown"
  const ny = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }))
  const day = ny.getDay()
  const minutes = ny.getHours() * 60 + ny.getMinutes()
  if (day < 1 || day > 5) return "closed"
  if (minutes >= 4 * 60 && minutes < 9 * 60 + 30) return "pre"
  if (minutes >= 9 * 60 + 30 && minutes < 16 * 60) return "regular"
  if (minutes >= 16 * 60 && minutes < 20 * 60) return "after"
  return "closed"
}

function addSessionScaledSocialFields(rows, bucketMinutes) {
  const maxima = new Map()
  for (const row of rows) {
    const session = row.session || "unknown"
    const current = maxima.get(session) || { count: 0, density: 0 }
    current.count = Math.max(current.count, Number(row.message_count || 0))
    current.density = Math.max(current.density, Number(row.message_density || 0))
    maxima.set(session, current)
  }

  return rows.map(row => {
    const max = maxima.get(row.session || "unknown") || { count: 0, density: 0 }
    const count = Number(row.message_count || 0)
    const density = Number(row.message_density || 0)
    const sentiment = Number(row.sentiment || 0)
    return {
      ...row,
      bucket_minutes: bucketMinutes,
      message_count_scaled: max.count ? Number((count / max.count).toFixed(3)) : 0,
      message_density_scaled: max.density ? Number((density / max.density).toFixed(3)) : 0,
      sentiment_scaled: Number(((sentiment + 1) / 2).toFixed(3)),
    }
  })
}

app.get("/api/finviz/movers", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, tickers: [], error: "MongoDB is not connected" })

    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)))
    const movers = await loadPositiveFinvizMoverRows(db, limit)
    const articleMap = await loadArticleStatsForTickers(db, movers.map(row => row.ticker), Number(req.query.days || 2))
    const socialMap = await loadSocialStatsForTickers(db, movers.map(row => row.ticker), Number(req.query.window_minutes || 1440))
    const tickers = movers.map(row => mergeMoverContext(row, articleMap.get(row.ticker), socialMap.get(row.ticker)))

    res.json({ ok: true, source: "Momentum movers", tickers, count: tickers.length })
  } catch (err) {
    res.status(500).json({ ok: false, tickers: [], error: String(err.message || err) })
  }
})

app.get("/api/social/rolling", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) {
      return res.status(503).json({ ok: false, error: "MongoDB is not connected", rows: [] })
    }

    const windowMinutes = Math.max(1, Math.min(1440, Number(req.query.window_minutes || 5)))
    const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 500)))
    const platform = String(req.query.platform || "all").toLowerCase()
    const ticker = normalizeTickerList([req.query.ticker || req.query.symbol], 1, { ensurePrivate: false })[0] || ""
    const sinceSec = Math.floor(Date.now() / 1000) - windowMinutes * 60

    const pipeline = [
      ...socialTimeStages(),
      { $match: { _event_sec: { $gte: sinceSec } } },
      {
        $match: {
          _norm_platform: { $ne: "Unstructured" },
          $or: [
            { ticker: { $type: "string", $ne: "" } },
            { symbol: { $type: "string", $ne: "" } },
            { tickers_mentioned: { $type: "string", $ne: "" } },
            { tickers_mentioned: { $type: "array", $ne: [] } },
          ],
        },
      },
    ]

    if (platform !== "all") {
      const platformMap = {
        reddit: "Reddit",
        bluesky: "Bluesky",
        bsky: "Bluesky",
        twitter: "Twitter",
        x: "Twitter",
        stocktwits: "StockTwits",
      }
      pipeline.push({ $match: { _norm_platform: platformMap[platform] || platform } })
    }

    if (ticker) {
      pipeline.push({
        $match: {
          $or: [
            { ticker },
            { symbol: ticker },
            { tickers_mentioned: ticker },
            { tickers_mentioned: { $elemMatch: { $eq: ticker } } },
          ],
        },
      })
    }

    pipeline.push(
      { $sort: { _event_sec: -1 } },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          platform: "$_norm_platform",
          source: 1,
          collector: 1,
          ticker: 1,
          symbol: 1,
          title: 1,
          text: 1,
          content: 1,
          url: 1,
          author: 1,
          sentiment: 1,
          sentiment_score: 1,
          cashtag: 1,
          finance_keywords: 1,
          keywords: 1,
          gossip_keywords: 1,
          gossip_score: 1,
          fetched_at: "$_event_sec",
          detected_at: 1,
          created_at: 1,
          timestamp: 1
        }
      }
    )

    const rows = await db.collection("socials").aggregate(pipeline).toArray()

    return res.json({
      ok: true,
      rows,
      count: rows.length,
      window_minutes: windowMinutes,
      platform,
      ticker,
      since_sec: sinceSec,
      now_sec: Math.floor(Date.now() / 1000),
    })
  } catch (err) {
    console.error("GET /api/social/rolling failed:", err)
    return res.status(500).json({ ok: false, error: String(err?.message || err), rows: [] })
  }
})

app.get("/api/social/series/:ticker", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) return res.status(503).json({ ok: false, ticker: "", rows: [], error: "MongoDB is not connected" })

    const ticker = normalizeTickerList([req.params.ticker], 1, { ensurePrivate: false })[0] || ""
    if (!ticker) return res.status(400).json({ ok: false, ticker: "", rows: [], error: "ticker is required" })

    const windowMinutes = Math.max(5, Math.min(4320, Number(req.query.window_minutes || 1440)))
    const bucketMinutes = Math.max(1, Math.min(60, Number(req.query.bucket_minutes || 5)))
    const sinceSec = Math.floor(Date.now() / 1000) - windowMinutes * 60
    const bucketSec = bucketMinutes * 60

    const rows = await db.collection("socials").aggregate([
      ...socialTimeStages(),
      { $match: { _event_sec: { $gte: sinceSec } } },
      {
        $match: {
          $or: [
            { ticker },
            { symbol: ticker },
            { tickers_mentioned: ticker },
            { tickers_mentioned: { $elemMatch: { $eq: ticker } } },
          ],
        },
      },
      {
        $addFields: {
          _bucket_sec: {
            $multiply: [
              { $floor: { $divide: ["$_event_sec", bucketSec] } },
              bucketSec,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$_bucket_sec",
          message_count: { $sum: 1 },
          bullish: {
            $sum: {
              $cond: [
                { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bull|positive" } },
                1,
                0,
              ],
            },
          },
          bearish: {
            $sum: {
              $cond: [
                { $regexMatch: { input: { $toLower: { $toString: { $ifNull: ["$sentiment", ""] } } }, regex: "bear|negative" } },
                1,
                0,
              ],
            },
          },
          platforms: { $addToSet: "$_norm_platform" },
        },
      },
      { $sort: { _id: 1 } },
    ]).toArray()

    const normalized = addSessionScaledSocialFields(rows.map(row => {
      const count = Number(row.message_count || 0)
      return {
        time: new Date(Number(row._id || 0) * 1000).toISOString(),
        bucket_sec: Number(row._id || 0),
        session: marketSessionForSec(row._id),
        message_count: count,
        message_density: Number((count / bucketMinutes).toFixed(3)),
        sentiment: count ? Number((((row.bullish || 0) - (row.bearish || 0)) / count).toFixed(3)) : 0,
        bullish: Number(row.bullish || 0),
        bearish: Number(row.bearish || 0),
        platforms: row.platforms || [],
      }
    }), bucketMinutes)

    res.json({
      ok: true,
      ticker,
      rows: normalized,
      window_minutes: windowMinutes,
      bucket_minutes: bucketMinutes,
      scaling: "per_ticker_per_market_session",
    })
  } catch (err) {
    console.error("GET /api/social/series/:ticker failed:", err)
    res.status(500).json({ ok: false, rows: [], error: String(err.message || err) })
  }
})

app.post("/api/social/fetch", async (req, res) => {
  const started = Date.now()
  const ticker = normalizeTickerList([req.query.ticker || req.body?.ticker], 1, { ensurePrivate: false })[0] || ""

  if (!ticker) {
    return res.status(400).json({ ok: false, error: "ticker is required", ms: Date.now() - started })
  }

  try {
    const result = await runPythonScript("1_News/pipeline/fetch_social_to_mongo.py", {
      timeout: 45000,
      extraEnv: {
        SOCIAL_TICKERS: ticker,
        SOCIAL_MAX_TICKERS: "1",
        SOCIAL_MAX_WORKERS: "1",
      },
    })
    const counts = parseSocialFetch(result.stdout || "")

    return res.status(result.ok ? 200 : 500).json({
      ok: result.ok,
      ticker,
      ...counts,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      ms: Date.now() - started,
    })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      ticker,
      error: String(err?.message || err),
      ms: Date.now() - started,
    })
  }
})

app.get("/api/social/rolling/stats", async (req, res) => {
  try {
    const db = mongoose.connection.db
    if (!db) {
      return res.status(503).json({ ok: false, error: "MongoDB is not connected", counts: {} })
    }

    const windowMinutes = Math.max(1, Math.min(1440, Number(req.query.window_minutes || 5)))
    const sinceSec = Math.floor(Date.now() / 1000) - windowMinutes * 60

    const rows = await db.collection("socials").aggregate([
      ...socialTimeStages(),
      { $match: { _event_sec: { $gte: sinceSec } } },
      {
        $match: {
          _norm_platform: { $ne: "Unstructured" },
          $or: [
            { ticker: { $type: "string", $ne: "" } },
            { symbol: { $type: "string", $ne: "" } },
            { tickers_mentioned: { $type: "string", $ne: "" } },
            { tickers_mentioned: { $type: "array", $ne: [] } },
          ],
        },
      },
      { $group: { _id: "$_norm_platform", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray()

    const counts = {}
    for (const row of rows) counts[row._id || "Unknown"] = row.count

    return res.json({
      ok: true,
      counts,
      rows,
      total: rows.reduce((sum, row) => sum + row.count, 0),
      window_minutes: windowMinutes,
      since_sec: sinceSec,
      now_sec: Math.floor(Date.now() / 1000),
    })
  } catch (err) {
    console.error("GET /api/social/rolling/stats failed:", err)
    return res.status(500).json({ ok: false, error: String(err?.message || err), counts: {} })
  }
})
// SOCIAL_ROLLING_API_V2_END


app.use('/api/social',      socialRouter)
app.use('/api/correlation', correlationRouter)
app.use('/api/settings',    settingsRouter)

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const { readyState } = mongoose.connection
  const states = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' }
  res.json({
    status:  'ok',
    db:      states[readyState] || 'unknown',
    time:    new Date().toISOString(),
  })
})

// ── Start ─────────────────────────────────────────────────
async function start() {
  await connectDB()
  
// Ryan frontend compatibility endpoints
app.get("/api/status", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const articles = db.collection("articles");
    const articleWindow = recentArticleMatch();
    const totalArticles = await articles.countDocuments(articleWindow);

    const latest = await articles.find(
      articleWindow,
      { projection: { title: 1, source: 1, publish_date: 1, fetched_date: 1 } }
    ).sort({ fetched_date: -1, publish_date: -1 }).limit(1).toArray();

    res.json({
      ok: true,
      status: "ok",
      connected: true,
      articles: totalArticles,
      total: totalArticles,
      article_count: totalArticles,
      database: {
        connected: mongoose.connection.readyState === 1,
        articles: totalArticles,
        total: totalArticles,
        article_count: totalArticles
      },
      latest_article: latest[0] || null,
      market_window_start: latestMarketCloseCutoff().toISOString(),
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      status: "error",
      connected: false,
      articles: 0,
      total: 0,
      article_count: 0,
      database: {
        connected: false,
        articles: 0,
        total: 0,
        article_count: 0
      },
      error: "Failed to load status"
    });
  }
});

app.get("/api/market/status", async (req, res) => {
  try {
    const now = new Date();
    const ny = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = ny.getDay(); // 0 = Sun .. 6 = Sat
    const hour = ny.getHours();
    const minute = ny.getMinutes();
    const minutes = hour * 60 + minute;

    const preStart = 4 * 60; // 04:00 ET
    const regularStart = 9 * 60 + 30; // 09:30 ET
    const regularEnd = 16 * 60; // 16:00 ET
    const afterEnd = 20 * 60; // 20:00 ET

    const isWeekday = day >= 1 && day <= 5
    const inPreMarket = isWeekday && minutes >= preStart && minutes < regularStart
    const inRegular = isWeekday && minutes >= regularStart && minutes < regularEnd
    const inAfterHours = isWeekday && minutes >= regularEnd && minutes < afterEnd

    const nextOpen = (() => {
      if (inRegular || inPreMarket || inAfterHours) {
        if (inRegular || inPreMarket) return `${String(9).padStart(2, '0')}:30 ET`
        return `${String(9).padStart(2, '0')}:30 ET`
      }

      const isFriday = day === 5
      const nextWeekday = isFriday ? 1 : day === 6 ? 1 : day === 0 ? 1 : day + 1
      return `${String(9).padStart(2, '0')}:30 ET on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][nextWeekday]}`
    })()

    const nextClose = inRegular ? `${String(16).padStart(2, '0')}:00 ET` : undefined

    let status = 'closed'
    let label = 'Market Closed'
    if (inRegular) {
      status = 'open'
      label = 'Market Open'
    } else if (inPreMarket) {
      status = 'pre'
      label = 'Pre-market'
    } else if (inAfterHours) {
      status = 'after'
      label = 'After-hours'
    }

    res.json({
      open: status === 'open',
      status,
      label,
      timezone: 'America/New_York',
      next_open: nextOpen,
      next_close: nextClose,
      updated_at: ny.toISOString()
    })
  } catch (err) {
    res.json({ open: false, status: 'unknown', label: 'Market Unknown', updated_at: new Date().toISOString() })
  }
});

app.get("/api/stats", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    res.json(await loadArticleStats(db, Number(req.query.days || req.query.recent_days || 0)));
  } catch (err) {
    const trackedTickers = loadTrackedTickers()
    res.status(500).json({
      total: 0,
      total_recent: 0,
      total_all: 0,
      sources: [],
      categories: [],
      sentiment: { bullish: 0, bearish: 0, neutral: 0, unknown: 0 },
      ticker_mentions: [],
      tracked_ticker_count: trackedTickers.length,
      tracked_tickers: trackedTickers,
      error: "Failed to load stats"
    });
  }
});

app.get("/api/keywords", async (req, res) => {
  res.json({
    keywords: [
      "earnings",
      "guidance",
      "upgrade",
      "downgrade",
      "merger",
      "acquisition",
      "lawsuit",
      "sec",
      "fda",
      "short squeeze",
      "bankruptcy",
      "dividend",
      "offering",
      "partnership"
    ]
  });
});


// Duplicate /api/keywords removed - see settings routes for the authoritative implementation

// Frontend compatibility endpoints
app.get("/api/status", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const articles = db.collection("articles");
    const [totalArticles, recentArticles] = await Promise.all([
      articles.countDocuments({}),
      articles.countDocuments(recentArticleMatch()),
    ]);

    res.json({
      ok: true,
      status: "ok",
      database: {
        connected: mongoose.connection.readyState === 1,
        articles: totalArticles,
        recent_articles: recentArticles,
        market_window_start: latestMarketCloseCutoff().toISOString()
      },
      time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      status: "error",
      database: {
        connected: false,
        articles: 0
      },
      error: "Failed to load status"
    });
  }
});

// Duplicate /api/market/status removed - see line 323 for the authoritative implementation

app.get("/api/stats", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    res.json(await loadArticleStats(db, Number(req.query.days || req.query.recent_days || 0)));
  } catch (err) {
    const trackedTickers = loadTrackedTickers()
    res.status(500).json({
      total: 0,
      total_recent: 0,
      total_all: 0,
      sources: [],
      categories: [],
      sentiment: { bullish: 0, bearish: 0, neutral: 0, unknown: 0 },
      ticker_mentions: [],
      tracked_ticker_count: trackedTickers.length,
      tracked_tickers: trackedTickers,
      error: "Failed to load stats"
    });
  }
});

// Duplicate /api/keywords removed - see settings routes for the authoritative implementation

async function runPythonScript(scriptPath, {
  timeout = 180000,
  extraEnv = {},
} = {}) {
  const { execFile } = await import("node:child_process")
  const { existsSync } = await import("node:fs")

  const pythonPath = existsSync("/opt/rssvenv/bin/python")
    ? "/opt/rssvenv/bin/python"
    : "python3"

  if (!existsSync(scriptPath)) {
    return {
      ok: false,
      skipped: true,
      stdout: "",
      stderr: "",
      error: `Script not found at ${scriptPath}`,
    }
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://mongo:27017/feedflash"

  try {
    const result = await new Promise((resolve, reject) => {
      execFile(
        pythonPath,
        [scriptPath],
        {
          cwd: process.cwd(),
          timeout,
          maxBuffer: 1024 * 1024 * 20,
          env: {
            ...process.env,
            MONGODB_URI: mongoUri,
            MONGO_URI: mongoUri,
            MONGO_DB: "feedflash",
            MONGODB_DB: "feedflash",
            RSS_COOLDOWN_SECONDS: "0",
            RSS_STATE_FILE: "/tmp/feedflash_rss_fetch_state.json",
            ...extraEnv,
          },
        },
        (error, stdout, stderr) => {
          if (error) {
            error.stdout = stdout
            error.stderr = stderr
            reject(error)
            return
          }
          resolve({ stdout, stderr })
        }
      )
    })

    return {
      ok: true,
      stdout: String(result.stdout || ""),
      stderr: String(result.stderr || ""),
    }
  } catch (err) {
    return {
      ok: false,
      stdout: String(err?.stdout || ""),
      stderr: String(err?.stderr || ""),
      error: String(err?.message || err),
    }
  }
}

function parseStructuredFetch(stdout, before, after) {
  const match =
    stdout.match(/RSS Mongo import complete\s+—\s+(\d+)\s+new,\s+(\d+)\s+updated,\s+(\d+)\s+unchanged/i) ||
    stdout.match(/RSS Mongo import complete.*?(\d+)\s+new.*?(\d+)\s+updated.*?(\d+)\s+unchanged/is)

  return {
    new_articles: match ? Number(match[1]) : Math.max(0, after - before),
    updated_articles: match ? Number(match[2]) : 0,
    unchanged_articles: match ? Number(match[3]) : 0,
  }
}

function parseUnstructuredFetch(stdout) {
  const found = stdout.match(/['"]found['"]:\s*(\d+)/)
  const upserted = stdout.match(/['"]upserted['"]:\s*(\d+)/)
  const modified = stdout.match(/['"]modified['"]:\s*(\d+)/)
  return {
    unstructured_found: found ? Number(found[1]) : 0,
    unstructured_new: upserted ? Number(upserted[1]) : 0,
    unstructured_updated: modified ? Number(modified[1]) : 0,
  }
}

function parseSocialFetch(stdout) {
  const match = stdout.match(/Social import complete\s+—\s+(\d+)\s+found,\s+(\d+)\s+new,\s+(\d+)\s+updated/i)
  return {
    social_found: match ? Number(match[1]) : 0,
    social_new: match ? Number(match[2]) : 0,
    social_updated: match ? Number(match[3]) : 0,
  }
}

function parseQuoteFetch(stdout) {
  const match = stdout.match(/Quote import complete\s+—\s+(\d+)\s+quotes,\s+(\d+)\s+updated/i)
  return {
    quotes_found: match ? Number(match[1]) : 0,
    quotes_updated: match ? Number(match[2]) : 0,
  }
}

function parseFinvizEliteFetch(stdout) {
  const match = stdout.match(/Finviz Elite import complete\s+—\s+(\d+)\s+rows,\s+(\d+)\s+updated,\s+(\d+)\s+dropped/i)
  return {
    finviz_rows: match ? Number(match[1]) : 0,
    finviz_updated: match ? Number(match[2]) : 0,
    finviz_dropped: match ? Number(match[3]) : 0,
  }
}

function parseTradingViewFetch(stdout) {
  const match = stdout.match(/TradingView import complete\s+—\s+(\d+)\s+found,\s+(\d+)\s+new,\s+(\d+)\s+updated/i)
  return {
    tradingview_found: match ? Number(match[1]) : 0,
    tradingview_new: match ? Number(match[2]) : 0,
    tradingview_updated: match ? Number(match[3]) : 0,
  }
}

async function runDataRefreshCycle(db, { socialMode = "full" } = {}) {
  const beforeArticles = await db.collection("articles").countDocuments()
  const beforeSocial = await db.collection("socials").countDocuments()
  const socialExtraEnv = {
    SOCIAL_MAX_TICKERS: process.env.SOCIAL_MAX_TICKERS || "250",
    SOCIAL_MAX_WORKERS: process.env.SOCIAL_MAX_WORKERS || "8",
  }

  let socialTickers = []
  if (socialMode === "top_momentum") {
    socialTickers = await loadTopMomentumTickerSymbols(db, 10)
    if (socialTickers.length) {
      socialExtraEnv.SOCIAL_TICKERS = socialTickers.join(",")
      socialExtraEnv.SOCIAL_MAX_TICKERS = String(socialTickers.length)
    } else {
      socialExtraEnv.SOCIAL_MAX_TICKERS = "10"
    }
  }

  const tradingViewExtraEnv = {}
  if (socialTickers.length) {
    tradingViewExtraEnv.TRADINGVIEW_TICKERS = socialTickers.join(",")
    tradingViewExtraEnv.TRADINGVIEW_MAX_TICKERS = String(socialTickers.length)
  }

  const [finvizElite, quotes, structured, tradingView, unstructured, social] = await Promise.all([
    runPythonScript("2_Screener/pipeline/fetch_finviz_elite_to_mongo.py", {
      timeout: 90000,
      extraEnv: {
        FINVIZ_MAX_WORKERS: process.env.FINVIZ_MAX_WORKERS || "6",
      },
    }),
    runPythonScript("1_News/pipeline/fetch_quotes_to_mongo.py", {
      timeout: 90000,
      extraEnv: { QUOTE_MAX_TICKERS: process.env.QUOTE_MAX_TICKERS || "250" },
    }),
    runPythonScript("1_News/pipeline/fetch_rss_to_mongo.py"),
    runPythonScript("1_News/pipeline/fetch_tradingview_to_mongo.py", {
      timeout: 90000,
      extraEnv: tradingViewExtraEnv,
    }),
    runPythonScript("1_News/pipeline/fetch_unstructured_news_titles_to_mongo.py", {
      timeout: 90000,
      extraEnv: { UNSTRUCTURED_MAX_PER_SOURCE: process.env.UNSTRUCTURED_MAX_PER_SOURCE || "10" },
    }),
    runPythonScript("1_News/pipeline/fetch_social_to_mongo.py", {
      timeout: 90000,
      extraEnv: socialExtraEnv,
    }),
  ])

  const afterStructuredArticles = await db.collection("articles").countDocuments()
  const structuredCounts = parseStructuredFetch(structured.stdout || "", beforeArticles, afterStructuredArticles)
  const afterArticles = await db.collection("articles").countDocuments()
  const afterSocial = await db.collection("socials").countDocuments()
  const unstructuredCounts = parseUnstructuredFetch(unstructured.stdout || "")
  const socialCounts = parseSocialFetch(social.stdout || "")
  const quoteCounts = parseQuoteFetch(quotes.stdout || "")
  const finvizCounts = parseFinvizEliteFetch(finvizElite.stdout || "")
  const tradingViewCounts = parseTradingViewFetch(tradingView.stdout || "")

  return {
    ok: finvizElite.ok && quotes.ok && structured.ok && tradingView.ok && unstructured.ok && social.ok,
    ...finvizCounts,
    ...quoteCounts,
    ...structuredCounts,
    ...tradingViewCounts,
    ...unstructuredCounts,
    ...socialCounts,
    total_articles: afterArticles,
    total_social: afterSocial,
    social_delta: Math.max(0, afterSocial - beforeSocial),
    social_mode: socialMode,
    social_target_source: socialMode === "top_momentum" ? "top positive momentum movers" : "configured watchlist",
    social_tickers: socialTickers,
    output: [
      structured.stdout,
      finvizElite.stdout,
      tradingView.stdout,
      unstructured.stdout,
      social.stdout,
      quotes.stdout,
    ].filter(Boolean).join("\n").slice(-6000),
    stderr: [
      structured.stderr,
      finvizElite.stderr,
      tradingView.stderr,
      unstructured.stderr,
      social.stderr,
      quotes.stderr,
    ].filter(Boolean).join("\n").slice(-3000),
    errors: [
      finvizElite.ok ? null : finvizElite.error,
      quotes.ok ? null : quotes.error,
      structured.ok ? null : structured.error,
      tradingView.ok ? null : tradingView.error,
      unstructured.ok ? null : unstructured.error,
      social.ok ? null : social.error,
    ].filter(Boolean),
  }
}

app.post("/api/fetch", async (req, res) => {
  const started = Date.now()

  try {
    const db = mongoose.connection.db
    if (!db) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB is not connected",
        new_articles: 0,
        ms: Date.now() - started,
      })
    }

    const result = await runDataRefreshCycle(db)
    return res.json({
      ...result,
      ms: Date.now() - started,
      message: "Ran structured, unstructured, and social importers",
    })
  } catch (err) {
    console.error("Real /api/fetch failed:", err)
    return res.status(500).json({
      ok: false,
      error: String(err?.message || err),
      new_articles: 0,
      ms: Date.now() - started,
      stdout: String(err?.stdout || "").slice(-3000),
      stderr: String(err?.stderr || "").slice(-3000),
    })
  }
})
// NEWS_RSS_FETCH_API_V3_END

app.get("/api/watch", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = 60;

  res.write(`event: start\n`);
  res.write(`data: ${JSON.stringify({ message: `Auto-watch started. Interval: ${interval}s. Social auto-fetch targets the top 10 positive momentum movers.` })}\n\n`);

  let isRunning = false;

  const runFetchCycle = async () => {
    if (isRunning) return; // Prevent overlapping cycles
    isRunning = true;
    
    const cycleStarted = Date.now();
    try {
      const db = mongoose.connection.db;
      const result = await runDataRefreshCycle(db, { socialMode: "top_momentum" })
      const newCount = Number(result.new_articles || 0) + Number(result.unstructured_new || 0)
      const updatedCount = Number(result.updated_articles || 0) + Number(result.unstructured_updated || 0)
      const tradingViewNew = Number(result.tradingview_new || 0)
      const tradingViewUpdated = Number(result.tradingview_updated || 0)
      const socialNew = Number(result.social_new || 0)
      const socialUpdated = Number(result.social_updated || 0)
      const quotesUpdated = Number(result.quotes_updated || 0)
      const finvizRows = Number(result.finviz_rows || 0)
      const ms = Date.now() - cycleStarted;

      res.write(`event: line\n`);
      res.write(`data: ${JSON.stringify({ 
        text: `${finvizRows} Finviz movers; ${quotesUpdated} quotes; +${newCount} articles${updatedCount > 0 ? `, ${updatedCount} refreshed` : ''}; +${tradingViewNew} TradingView${tradingViewUpdated > 0 ? `, ${tradingViewUpdated} refreshed` : ''}; +${socialNew} social${socialUpdated > 0 ? `, ${socialUpdated} refreshed` : ''}${result.social_tickers?.length ? ` [${result.social_tickers.join(', ')}]` : ''} (${(ms / 1000).toFixed(1)}s)`,
        new: newCount + tradingViewNew,
        updated: updatedCount + tradingViewUpdated,
        tradingview_new: tradingViewNew,
        tradingview_updated: tradingViewUpdated,
        social_new: socialNew,
        social_updated: socialUpdated,
        social_tickers: result.social_tickers || [],
        finviz_rows: finvizRows,
        quotes_updated: quotesUpdated,
        ms: ms
      })}\n\n`);
    } catch (err) {
      console.error("Auto-watch cycle failed:", err);
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: `Auto-watch cycle failed: ${err.message}` })}\n\n`);
    } finally {
      isRunning = false;
    }
  };

  // Run first cycle immediately, then schedule for every interval
  await runFetchCycle();
  
  const timer = setInterval(runFetchCycle, interval * 1000);

  req.on("close", () => {
    clearInterval(timer);
  });
});
// End Ryan frontend compatibility endpoints



app.get("/api/sources/health", async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const rows = await db.collection("articles").aggregate([
      {
        $group: {
          _id: "$source",
          count: { $sum: 1 },
          latest_fetch: { $max: "$fetched_date" },
          latest_publish: { $max: "$publish_date" }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    const working = rows.map((r) => ({
      source: r._id,
      status: "working",
      count: r.count,
      latest_fetch: r.latest_fetch,
      latest_publish: r.latest_publish
    }));

    const knownSources = [
      "SEC EDGAR 8-K",
      "SEC EDGAR 10-Q",
      "SEC EDGAR 10-K",
      "PR Newswire",
      "ACCESS Newswire",
      "GlobeNewswire Public Companies",
      "FDA Press Releases",
      "FDA Recalls",
      "FDA MedWatch Safety Alerts",
      "TradingView News Flow",
      "TradingView News",
      "Finviz News",
      "BusinessWire",
      "Benzinga",
      "Dow Jones Newswires",
      "Interactive Brokers News",
      "Schwab News"
    ];
    const sourceStatus = {
      "TradingView News Flow": "public_endpoint_ready",
      "BusinessWire": "valid_rss_channel_required",
      "Benzinga": "api_key_required",
      "Dow Jones Newswires": "licensed_feed_required",
      "Interactive Brokers News": "broker_api_pending",
      "Schwab News": "broker_api_pending"
    };

    const workingNames = new Set(working.map((r) => r.source));

    const missing = knownSources
      .filter((source) => !workingNames.has(source))
      .map((source) => ({
        source,
        status: sourceStatus[source] || "needs_fix",
        count: 0,
        latest_fetch: null,
        latest_publish: null
      }));

    res.json({
      working_count: working.length,
      missing_count: missing.length,
      sources: [...working, ...missing]
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load source health", detail: err.message });
  }
});


// FEEDFLASH_SETTINGS_KEYWORDS_SOURCES_PATCH_V1

function settingsDb() {
  const d = mongoose.connection.db
  if (!d) throw new Error('MongoDB connection is not ready')
  return d
}

const DEFAULT_SIGNAL_KEYWORDS = [
  ["earnings", "fundamental"],
  ["ipo", "fundamental"],
  ["listing", "fundamental"],
  ["delisting", "fundamental"],
  ["dividend", "fundamental"],
  ["merger", "fundamental"],
  ["acquisition", "fundamental"],
  ["buyout", "fundamental"],
  ["contract", "fundamental"],
  ["partnership", "fundamental"],
  ["fda approval", "regulatory"],
  ["fda rejection", "regulatory"],
  ["clinical trial", "regulatory"],
  ["sec filing", "regulatory"],
  ["short squeeze", "momentum"],
  ["price target", "analyst"],
  ["downgrade", "analyst"],
  ["upgrade", "analyst"],
  ["beat estimates", "fundamental"],
  ["miss estimates", "fundamental"],
  ["guidance", "fundamental"],
  ["recall", "regulatory"],
  ["bankruptcy", "fundamental"],
  ["layoffs", "fundamental"],
  ["restructuring", "fundamental"]
];

async function seedDefaultKeywordsIfEmpty() {
  const keywords = settingsDb().collection("keywords");
  const count = await keywords.countDocuments();
  if (count > 0) return;

  await keywords.insertMany(DEFAULT_SIGNAL_KEYWORDS.map(([keyword, category]) => ({
    keyword,
    word: keyword,
    category,
    enabled: true,
    active: true,
    hits: 0,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000)
  })));
}

function cleanSettingText(v) {
  return String(v || "").trim();
}

function cleanKeyword(v) {
  return cleanSettingText(v).toLowerCase();
}

app.get("/api/keywords", async (req, res) => {
  try {
    await seedDefaultKeywordsIfEmpty();
    const rows = await settingsDb().collection("keywords")
      .find({})
      .sort({ enabled: -1, category: 1, keyword: 1, word: 1 })
      .toArray();

    res.json({
      ok: true,
      keywords: rows.map(r => ({
        id: String(r._id),
        keyword: r.keyword || r.word,
        word: r.word || r.keyword,
        category: r.category || "custom",
        enabled: r.enabled !== false && r.active !== false,
        active: r.enabled !== false && r.active !== false,
        hits: r.hits || 0
      }))
    });
  } catch (err) {
    console.error("GET /api/keywords failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/keywords", async (req, res) => {
  try {
    const keyword = cleanKeyword(req.body.keyword || req.body.word);
    const category = cleanSettingText(req.body.category || "custom").toLowerCase();

    if (!keyword) return res.status(400).json({ ok: false, error: "keyword is required" });

    const now = Math.floor(Date.now() / 1000);
    await settingsDb().collection("keywords").updateOne(
      { keyword },
      {
        $set: { keyword, word: keyword, category, enabled: true, active: true, updated_at: now },
        $setOnInsert: { hits: 0, created_at: now }
      },
      { upsert: true }
    );

    res.json({ ok: true, keyword, category });
  } catch (err) {
    console.error("POST /api/keywords failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.patch("/api/keywords/:keyword", async (req, res) => {
  try {
    const keyword = cleanKeyword(decodeURIComponent(req.params.keyword));
    const enabled = req.body.enabled !== false && req.body.active !== false;
    const result = await settingsDb().collection("keywords").updateOne(
      { $or: [{ keyword }, { word: keyword }] },
      { $set: { enabled, active: enabled, updated_at: Math.floor(Date.now() / 1000) } }
    );
    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error("PATCH /api/keywords/:keyword failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.delete("/api/keywords/:keyword", async (req, res) => {
  try {
    const keyword = cleanKeyword(decodeURIComponent(req.params.keyword));
    const result = await settingsDb().collection("keywords").deleteOne({ $or: [{ keyword }, { word: keyword }] });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/keywords/:keyword failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

const PROFESSOR_STRUCTURED_SOURCES = [
  { source: "PR Newswire", status: "public_feed", method: "rss", editable: false },
  { source: "GlobeNewswire", status: "public_feed", method: "rss", editable: false },
  { source: "SEC EDGAR", status: "public_api", method: "official_sec_atom", editable: false },
  { source: "FDA", status: "public_feed", method: "official_fda_rss", editable: false },
  { source: "Business Wire", status: "valid_rss_channel_required", method: "official_businesswire_rss_or_media_partner_feed", editable: false },
  { source: "ACCESS Newswire / AccessWire", status: "public_endpoint", method: "accessnewswire_newsroom_json", editable: false },
  { source: "Benzinga", status: "api_key_required", method: "official_benzinga_stock_news_api", editable: false },
  { source: "Dow Jones Newswires", status: "contract_required", method: "licensed_api", editable: false },
  { source: "TradingView News Flow", status: "public_endpoint", method: "news_mediator_symbol_endpoint", editable: false },
  { source: "Interactive Brokers News", status: "broker_api_required", method: "broker_api", editable: false },
  { source: "Charles Schwab / TD Ameritrade News", status: "broker_api_required", method: "broker_api", editable: false }
];

async function countArticlesForSourceLabel(label) {
  const parts = label.split("/").map(s => s.trim()).filter(Boolean);
  const pattern = parts.length ? parts.join("|") : label;
  return settingsDb().collection("articles").countDocuments({ source: new RegExp(pattern, "i") });
}

app.get("/api/settings/sources", async (req, res) => {
  try {
    const custom = await settingsDb().collection("rss_sources")
      .find({})
      .sort({ enabled: -1, name: 1 })
      .toArray();

    const structured = [];
    for (const s of PROFESSOR_STRUCTURED_SOURCES) {
      structured.push({
        ...s,
        count: await countArticlesForSourceLabel(s.source)
      });
    }

    res.json({
      ok: true,
      structured,
      custom_rss_sources: custom.map(s => ({
        id: String(s._id),
        name: s.name,
        source: s.name,
        url: s.url,
        category: s.category || "custom",
        enabled: s.enabled !== false,
        status: s.enabled === false ? "disabled" : "enabled",
        editable: true
      }))
    });
  } catch (err) {
    console.error("GET /api/settings/sources failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.post("/api/settings/sources", async (req, res) => {
  try {
    const name = cleanSettingText(req.body.name || req.body.source);
    const url = cleanSettingText(req.body.url);
    const category = cleanSettingText(req.body.category || "custom").toLowerCase();

    if (!name || !url) return res.status(400).json({ ok: false, error: "name and url are required" });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: "url must start with http:// or https://" });

    const now = Math.floor(Date.now() / 1000);
    await settingsDb().collection("rss_sources").updateOne(
      { name },
      {
        $set: { name, url, category, enabled: true, updated_at: now },
        $setOnInsert: { created_at: now }
      },
      { upsert: true }
    );

    res.json({ ok: true, name, url, category });
  } catch (err) {
    console.error("POST /api/settings/sources failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.patch("/api/settings/sources/:name", async (req, res) => {
  try {
    const name = cleanSettingText(decodeURIComponent(req.params.name));
    const enabled = req.body.enabled !== false;
    const result = await settingsDb().collection("rss_sources").updateOne(
      { name },
      { $set: { enabled, updated_at: Math.floor(Date.now() / 1000) } }
    );
    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    console.error("PATCH /api/settings/sources/:name failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

app.delete("/api/settings/sources/:name", async (req, res) => {
  try {
    const name = cleanSettingText(decodeURIComponent(req.params.name));
    const result = await settingsDb().collection("rss_sources").deleteOne({ name });
    res.json({ ok: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("DELETE /api/settings/sources/:name failed:", err);
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});


// FEEDFLASH_SETTINGS_KEYWORDS_ALIAS_PATCH_V1
app.get('/api/settings/keywords', async (req, res) => {
  try {
    await seedDefaultKeywordsIfEmpty()

    const rows = await settingsDb().collection('keywords')
      .find({})
      .sort({ enabled: -1, category: 1, keyword: 1, word: 1 })
      .toArray()

    res.json({
      ok: true,
      keywords: rows.map(r => ({
        id: String(r._id),
        keyword: r.keyword || r.word,
        word: r.word || r.keyword,
        category: r.category || 'custom',
        enabled: r.enabled !== false && r.active !== false,
        active: r.enabled !== false && r.active !== false,
        hits: r.hits || 0
      }))
    })
  } catch (err) {
    console.error('GET /api/settings/keywords failed:', err)
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.post('/api/settings/keywords', async (req, res) => {
  try {
    const keyword = cleanKeyword(req.body?.keyword || req.body?.word)
    const category = cleanSettingText(req.body?.category || 'custom').toLowerCase()

    if (!keyword) return res.status(400).json({ ok: false, error: 'keyword is required' })

    const now = Math.floor(Date.now() / 1000)
    await settingsDb().collection('keywords').updateOne(
      { keyword },
      {
        $set: { keyword, word: keyword, category, enabled: true, active: true, updated_at: now },
        $setOnInsert: { hits: 0, created_at: now }
      },
      { upsert: true }
    )

    res.json({ ok: true, keyword, category })
  } catch (err) {
    console.error('POST /api/settings/keywords failed:', err)
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.patch('/api/settings/keywords/:keyword', async (req, res) => {
  try {
    const keyword = cleanKeyword(decodeURIComponent(req.params.keyword))
    const enabled = req.body?.enabled !== false && req.body?.active !== false

    const result = await settingsDb().collection('keywords').updateOne(
      { $or: [{ keyword }, { word: keyword }] },
      { $set: { enabled, active: enabled, updated_at: Math.floor(Date.now() / 1000) } }
    )

    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount })
  } catch (err) {
    console.error('PATCH /api/settings/keywords failed:', err)
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.delete('/api/settings/keywords/:keyword', async (req, res) => {
  try {
    const keyword = cleanKeyword(decodeURIComponent(req.params.keyword))

    const result = await settingsDb().collection('keywords').deleteOne({
      $or: [{ keyword }, { word: keyword }]
    })

    res.json({ ok: true, deleted: result.deletedCount })
  } catch (err) {
    console.error('DELETE /api/settings/keywords failed:', err)
    res.status(500).json({ ok: false, error: String(err.message || err) })
  }
})

app.listen(PORT, () => {
    console.log()
    console.log('  ⚡ FlashFeed API')
    console.log('  ─────────────────────────────────────')
    console.log('  Server  →  http://localhost:' + PORT)
    console.log('  Health  →  http://localhost:' + PORT + '/api/health')
    console.log('  Docs    →  README-MONGODB.md')
    console.log()
  })
}

start()
