# FlashFeed — Real-Time Finance Research Dashboard

A self-hosted finance dashboard that aggregates news, social sentiment, and market data into one live interface. Runs entirely in Docker — no local Node.js or Python required.

---

## What It Does

| Feature | Description |
|---|---|
| **Live News Feed** | RSS aggregator pulls from 40+ finance sources every cycle |
| **Social Sentiment** | Stocktwits public API + Reddit RSS finance subreddits |
| **AI Overview** | Scores tickers by article count, sentiment, and momentum |
| **Mover-Matched News** | Matches top price movers to relevant articles |
| **Charts** | Candlestick + Bollinger Bands, RSI, MACD, sentiment overlays |
| **Screener** | TradingView-style momentum screener |

---

## Prerequisites

- **Docker Desktop** — [download here](https://www.docker.com/products/docker-desktop/)
- **Git** — [download here](https://git-scm.com/downloads)
- 8 GB RAM recommended (4 GB minimum)
- No other software needed — Node.js, Python, and all dependencies run inside containers

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ryanberube/Ryan_Berube_Code_06202026.git
cd Ryan_Berube_Code_06202026

# 2. Copy the example environment file
cp .env.example .env

# 3. Start all services (first run builds images, takes ~5 minutes)
docker compose up -d --build

# 4. Open the dashboard
#    http://localhost:5173
```

> **First run tip:** The RSS worker starts populating news immediately. Give it 2–3 minutes for articles to appear. Stocktwits populates in the first 30 seconds.

---

## Stopping & Restarting

```bash
# Stop everything (data is preserved in Docker volumes)
docker compose down

# Start again (no rebuild needed)
docker compose up -d

# Full reset — deletes all data and rebuilds from scratch
docker compose down -v
docker compose up -d --build
```

---

## Services

| Container | Port | Purpose |
|---|---|---|
| `feedflash-frontend` | **5173** | React dashboard (Vite dev server) |
| `feedflash-backend` | 3001 | Node.js API server |
| `feedflash-mongo` | 27017 | MongoDB — stores articles, socials, screeners |
| `feedflash-redis` | 6379 | Redis — pure RAM cache (no disk persistence) |
| `feedflash-kafka` | 9092 | Kafka message bus (RAM-first, 1h retention) |
| `feedflash-rss-worker` | — | Python RSS crawler, cycles continuously |
| `feedflash-social-worker` | — | Stocktwits + Reddit RSS collector |
| `feedflash-kafka-consumer` | — | Kafka → MongoDB bridge |
| `feedflash-zookeeper` | 2181 | Kafka coordination (internal) |

### Optional Services (not started by default)

```bash
# FinBERT NLP sentiment scorer (requires ~4 GB download on first run)
docker compose --profile worker up -d sentiment-worker
```

---

## Environment Variables

Copy `.env.example` to `.env`. Most variables are optional — the dashboard works without any API keys using public data sources.

| Variable | Required | Description |
|---|---|---|
| `SEC_USER_AGENT` | Recommended | Your name + email for SEC EDGAR requests |
| `FINVIZ_AUTH_TOKEN` | Optional | Finviz Elite token for screener data |
| `BENZINGA_API_KEY` | Optional | Benzinga Pro news API key |
| `X_BEARER_TOKEN` | Optional | Twitter/X API bearer token |
| `REDDIT_CLIENT_ID` | Optional | Reddit OAuth app ID (for higher rate limits) |
| `REDDIT_CLIENT_SECRET` | Optional | Reddit OAuth app secret |
| `SCHWAB_ACCESS_TOKEN` | Optional | Charles Schwab market data token |

Set your SEC user agent to improve EDGAR access:
```env
SEC_USER_AGENT=Your Name yourname@email.com
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser                           │
│              http://localhost:5173                  │
└───────────────────┬─────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────┐
│              Frontend (Vite/React)                  │
│  Overview · Charts · Screener · Social · Events     │
└───────────────────┬─────────────────────────────────┘
                    │ /api/*
┌───────────────────▼─────────────────────────────────┐
│             Backend (Node.js / Express)             │
│  /api/articles  /api/ai/scores  /api/charts/:ticker │
└──────┬──────────────┬──────────────┬────────────────┘
       │              │              │
┌──────▼──────┐ ┌─────▼──────┐ ┌───▼──────────────────┐
│   MongoDB   │ │   Redis    │ │       Kafka           │
│  articles   │ │  RAM-only  │ │  1h retention / RAM   │
│  socials    │ │  512 MB    │ │  page-cache first     │
│  screeners  │ └────────────┘ └──────────────────────┘
└──────▲──────┘
       │
┌──────┴──────────────────────────────────────────────┐
│              Background Workers                     │
│  rss-worker    → 40+ news RSS feeds                 │
│  social-worker → Stocktwits + Reddit RSS            │
└─────────────────────────────────────────────────────┘
```

### RAM Design

- **Redis** runs with `--save "" --appendonly no` — zero disk I/O, pure memory cache with LRU eviction at 512 MB
- **Kafka** uses OS page cache as its primary buffer; fsync runs every 5 minutes (`KAFKA_LOG_FLUSH_INTERVAL_MS=300000`), so hot data stays in RAM between flushes. Retention is capped at 1 hour / 512 MB

---

## Rebuilding Individual Services

```bash
# Rebuild just the backend after code changes
docker compose up -d --build backend

# Rebuild all workers
docker compose up -d --build rss-worker social-worker

# View live logs for any service
docker compose logs -f rss-worker
docker compose logs -f social-worker
docker compose logs -f backend
```

---

## Checking Data in MongoDB

```bash
# Open a MongoDB shell
docker exec -it feedflash-mongo mongosh feedflash

# Count articles
db.articles.countDocuments()

# Count social posts
db.socials.countDocuments()

# See Reddit posts
db.socials.find({ platform: "Reddit" }).limit(5).pretty()

# See top tickers by article count
db.articles.aggregate([
  { $match: { ticker: { $ne: "" } } },
  { $group: { _id: "$ticker", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
])
```

---

## Troubleshooting

**Dashboard is blank / "Loading..."**
- Wait 2–3 minutes for the RSS worker to populate articles on first run
- Check backend logs: `docker compose logs backend`

**No social posts**
- Check social worker: `docker compose logs social-worker`
- Reddit uses a rotating approach (1 subreddit per 5-minute cycle across 6 subreddits) to avoid rate limiting

**Port 5173 / 3001 already in use**
- Stop anything running on those ports, or edit `docker-compose.yml` to use different host ports

**Kafka fails to start**
- Ensure Docker has at least 2 GB RAM allocated (Docker Desktop → Settings → Resources)

**Out of disk space**
- Clean unused Docker images: `docker system prune -f`

---

## Project Structure

```
├── app/                    # React frontend (Vite + Tailwind)
│   └── src/pages/          # OverviewPage, ChartsPage, ScreenerPage, ...
├── Infrastructure/
│   ├── server/             # Node.js/Express API + Dockerfile
│   └── kafka/              # Kafka consumer + Dockerfile
├── 1_News/pipeline/        # RSS → MongoDB crawler
├── 5_Social/pipeline/      # Stocktwits + Reddit → MongoDB
├── config/                 # Ticker lists, feed lists
├── docker-compose.yml      # All services
├── Dockerfile.rss          # RSS worker image
├── Dockerfile.social       # Social worker image
├── Dockerfile.sentiment    # FinBERT sentiment worker (optional)
└── .env.example            # Environment variable template
```

---

## License

MIT
