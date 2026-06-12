"""
Fetch public StockTwits posts for the configured stock watchlist and upsert them
into MongoDB's socials collection for the dashboard rolling social feed.
"""

from __future__ import annotations

import hashlib
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests
from pymongo import MongoClient, UpdateOne
try:
    import feedparser
except Exception:
    feedparser = None

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TICKER_FILE = ROOT / "config" / "social_tickers_100.txt"

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/feedflash")
DB_NAME = os.getenv("MONGODB_DB", os.getenv("MONGO_DB", "feedflash"))
TICKER_FILE = Path(os.getenv("SOCIAL_TICKER_FILE", str(DEFAULT_TICKER_FILE)))
MAX_TICKERS = int(os.getenv("SOCIAL_MAX_TICKERS", "250"))
MAX_WORKERS = int(os.getenv("SOCIAL_MAX_WORKERS", "8"))
TIMEOUT = int(os.getenv("SOCIAL_REQUEST_TIMEOUT", "15"))
INCLUDE_REDDIT = os.getenv("SOCIAL_INCLUDE_REDDIT", "true").lower() in ("1", "true", "yes")
INCLUDE_X = os.getenv("SOCIAL_INCLUDE_X", "true").lower() in ("1", "true", "yes")
INCLUDE_BLUESKY = os.getenv("SOCIAL_INCLUDE_BLUESKY", "true").lower() in ("1", "true", "yes")
X_BEARER_TOKEN = os.getenv("X_BEARER_TOKEN", "").strip()
X_MAX_RESULTS = int(os.getenv("SOCIAL_X_MAX_RESULTS", "10"))
BLUESKY_MAX_RESULTS = int(os.getenv("SOCIAL_BLUESKY_MAX_RESULTS", "10"))
REDDIT_MAX_PER_SUBREDDIT = int(os.getenv("SOCIAL_REDDIT_MAX_PER_SUBREDDIT", "3"))
REDDIT_SUBREDDITS = [
    s.strip()
    for s in os.getenv("SOCIAL_REDDIT_SUBREDDITS", "stocks,StockMarket,Daytrading,pennystocks").split(",")
    if s.strip()
]

CRYPTO_TICKERS = {
    "BTC", "ETH", "LTC", "DOGE", "SOL", "ADA", "XRP", "BNB", "DOT", "AVAX",
    "MATIC", "SHIB", "TRX", "BCH", "LINK", "ATOM", "UNI", "ETC", "FIL",
}

HEADERS = {"User-Agent": "Mozilla/5.0 FlashFeed/1.0"}
REDDIT_HEADERS = {"User-Agent": "FeedFlashStockDashboard/0.1 by OtisMurray"}
BLUESKY_API = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts"

BULLISH_WORDS = {
    "bullish", "calls", "breakout", "squeeze", "ripping", "moon", "long",
    "buy", "bought", "beat", "upgrade", "guidance", "surge", "gap up",
}

BEARISH_WORDS = {
    "bearish", "puts", "short", "shorting", "sell", "sold", "miss",
    "downgrade", "offering", "lawsuit", "halt", "dilution", "gap down",
}


def _clean(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


def _post_id(ticker: str, msg_id) -> str:
    return hashlib.sha1(f"stocktwits:{ticker}:{msg_id}".encode()).hexdigest()[:24]


def _load_tickers() -> list[str]:
    configured = os.getenv("SOCIAL_TICKERS", "")
    if configured.strip():
        tickers = [t.strip().upper() for t in configured.split(",") if t.strip()]
    else:
        tickers = [line.strip().upper() for line in TICKER_FILE.read_text().splitlines() if line.strip()]

    filtered = []
    seen = set()
    for ticker in tickers:
        if ticker in seen or ticker in CRYPTO_TICKERS:
            continue
        if not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,5}", ticker):
            continue
        filtered.append(ticker)
        seen.add(ticker)
        if len(filtered) >= MAX_TICKERS:
            break
    return filtered


def _created_ts(raw: str) -> int:
    if not raw:
        return int(time.time())
    try:
        return int(datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())
    except Exception:
        return int(time.time())


def _sentiment_value(message: dict) -> tuple[str, float]:
    entities = message.get("entities") or {}
    sentiment_obj = entities.get("sentiment") or message.get("sentiment") or {}
    raw = ""
    if isinstance(sentiment_obj, dict):
        raw = str(sentiment_obj.get("basic") or "").lower()
    if raw == "bullish":
        return "bullish", 1.0
    if raw == "bearish":
        return "bearish", -1.0
    return "neutral", 0.0


def _score_text_sentiment(text: str) -> tuple[str, float]:
    low = (text or "").lower()
    bullish = sum(1 for word in BULLISH_WORDS if word in low)
    bearish = sum(1 for word in BEARISH_WORDS if word in low)
    if bullish > bearish:
      return "bullish", 1.0
    if bearish > bullish:
      return "bearish", -1.0
    return "neutral", 0.0


def _parse_iso_ts(raw: str) -> int:
    if not raw:
        return int(time.time())
    try:
        return int(datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp())
    except Exception:
        return int(time.time())


def _fetch_ticker(ticker: str) -> list[dict]:
    url = f"https://api.stocktwits.com/api/2/streams/symbol/{ticker}.json"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if resp.status_code != 200:
            print(f"StockTwits {ticker}: HTTP {resp.status_code}")
            return []
        payload = resp.json()
    except Exception as exc:
        print(f"StockTwits {ticker}: SKIP {exc}")
        return []

    now = int(time.time())
    docs = []
    messages = payload.get("messages", [])
    message_volume = len(messages)
    message_density = round(message_volume / 30, 3)

    for message in messages:
        body = _clean(message.get("body", ""))
        if not body:
            continue
        sentiment, score = _sentiment_value(message)
        user = message.get("user") or {}
        created_at = _created_ts(message.get("created_at", ""))
        doc_id = _post_id(ticker, message.get("id", body))
        docs.append({
            "id": doc_id,
            "platform": "StockTwits",
            "source": "StockTwits",
            "collector": "stocktwits_public_symbol_stream",
            "ticker": ticker,
            "symbol": ticker,
            "title": body[:180],
            "text": body[:1000],
            "content": body[:1000],
            "url": f"https://stocktwits.com/symbol/{ticker}",
            "source_url": url,
            "cashtag": f"${ticker}",
            "author": user.get("username", ""),
            "sentiment": sentiment,
            "sentiment_score": score,
            "message_volume": message_volume,
            "message_density": message_density,
            "fetched_at": now,
            "created_at": created_at,
            "timestamp": created_at,
        })
    return docs


def _fetch_reddit_ticker(ticker: str) -> list[dict]:
    if not INCLUDE_REDDIT or feedparser is None:
        return []

    docs = []
    now = int(time.time())
    for subreddit in REDDIT_SUBREDDITS:
        query = f"${ticker}"
        json_url = f"https://old.reddit.com/r/{subreddit}/search.json"
        feed_url = f"https://www.reddit.com/r/{subreddit}/search.rss?q=%24{ticker}&restrict_sr=1&sort=new&t=day"
        try:
            resp = requests.get(
                json_url,
                headers=REDDIT_HEADERS,
                params={"q": query, "restrict_sr": "on", "sort": "new", "t": "day", "limit": REDDIT_MAX_PER_SUBREDDIT},
                timeout=TIMEOUT,
            )
            if resp.status_code == 200:
                children = resp.json().get("data", {}).get("children", [])[:REDDIT_MAX_PER_SUBREDDIT]
                entries = []
                for child in children:
                    data = child.get("data", {}) or {}
                    permalink = data.get("permalink") or ""
                    entries.append({
                        "title": data.get("title") or "",
                        "link": f"https://www.reddit.com{permalink}" if permalink else data.get("url") or "",
                        "summary": data.get("selftext") or "",
                        "author": data.get("author") or "",
                        "created_at": int(data.get("created_utc") or now),
                    })
            else:
                resp = requests.get(feed_url, headers=REDDIT_HEADERS, timeout=TIMEOUT)
                if resp.status_code != 200:
                    print(f"Reddit r/{subreddit} ${ticker}: HTTP {resp.status_code}")
                    continue
                feed = feedparser.parse(resp.text)
                entries = [
                    {
                        "title": getattr(entry, "title", "") or "",
                        "link": getattr(entry, "link", "") or "",
                        "summary": getattr(entry, "summary", "") or "",
                        "author": getattr(entry, "author", "") or "",
                        "published_parsed": getattr(entry, "published_parsed", None),
                    }
                    for entry in feed.entries[:REDDIT_MAX_PER_SUBREDDIT]
                ]
        except Exception as exc:
            print(f"Reddit r/{subreddit} ${ticker}: SKIP {exc}")
            continue

        message_volume = len(entries)
        message_density = round(message_volume / 30, 3)

        for entry in entries:
            title = _clean(entry.get("title") or "")
            link = entry.get("link") or ""
            summary = _clean(entry.get("summary") or "")
            text = f"{title} {summary}".strip()
            if not title or not link:
                continue
            if f"${ticker}".lower() not in text.lower() and ticker.lower() not in text.lower():
                continue

            sentiment, score = _score_text_sentiment(text)
            created_at = int(entry.get("created_at") or now)
            if entry.get("published_parsed"):
                try:
                    created_at = int(time.mktime(entry["published_parsed"]))
                except Exception:
                    created_at = now

            doc_id = hashlib.sha1(f"reddit:{ticker}:{link}".encode()).hexdigest()[:24]
            docs.append({
                "id": doc_id,
                "platform": "Reddit",
                "source": f"r/{subreddit}",
                "collector": "reddit_subreddit_symbol_search_rss",
                "ticker": ticker,
                "symbol": ticker,
                "title": title[:180],
                "text": text[:1000],
                "content": summary[:1000],
                "url": link,
                "source_url": feed_url,
                "subreddit": subreddit,
                "cashtag": f"${ticker}",
                "author": entry.get("author", ""),
                "sentiment": sentiment,
                "sentiment_score": score,
                "message_volume": message_volume,
                "message_density": message_density,
                "fetched_at": now,
                "created_at": created_at,
                "timestamp": created_at,
            })

    return docs


def _fetch_bluesky_ticker(ticker: str) -> list[dict]:
    if not INCLUDE_BLUESKY:
        return []

    query = f"${ticker}"
    try:
        resp = requests.get(
            BLUESKY_API,
            headers=HEADERS,
            params={"q": query, "limit": max(1, min(BLUESKY_MAX_RESULTS, 100)), "sort": "latest"},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            print(f"Bluesky ${ticker}: HTTP {resp.status_code} {resp.text[:180]}")
            return []
        payload = resp.json()
    except Exception as exc:
        print(f"Bluesky ${ticker}: SKIP {exc}")
        return []

    now = int(time.time())
    posts = payload.get("posts", [])
    message_volume = len(posts)
    message_density = round(message_volume / 30, 3)
    docs = []

    for post in posts:
        uri = post.get("uri") or ""
        record = post.get("record") or {}
        text = _clean(record.get("text") or "")
        author = post.get("author") or {}
        handle = author.get("handle") or ""
        if not uri or not text or f"${ticker}".lower() not in text.lower():
            continue

        post_id = uri.split("/")[-1]
        sentiment, score = _score_text_sentiment(text)
        doc_id = hashlib.sha1(f"bluesky:{ticker}:{uri}".encode()).hexdigest()[:24]
        docs.append({
            "id": doc_id,
            "platform": "Bluesky",
            "source": "Bluesky",
            "collector": "bluesky_public_search_cashtag",
            "ticker": ticker,
            "symbol": ticker,
            "title": text[:180],
            "text": text[:1000],
            "content": text[:1000],
            "url": f"https://bsky.app/profile/{handle}/post/{post_id}" if handle and post_id else "",
            "source_url": BLUESKY_API,
            "query": query,
            "cashtag": f"${ticker}",
            "author": handle,
            "sentiment": sentiment,
            "sentiment_score": score,
            "message_volume": message_volume,
            "message_density": message_density,
            "reply_count": post.get("replyCount"),
            "repost_count": post.get("repostCount"),
            "like_count": post.get("likeCount"),
            "fetched_at": now,
            "created_at": _parse_iso_ts(record.get("createdAt") or ""),
            "timestamp": _parse_iso_ts(record.get("createdAt") or ""),
        })

    return docs


def _fetch_x_ticker(ticker: str) -> list[dict]:
    if not INCLUDE_X:
        return []
    if not X_BEARER_TOKEN:
        return []

    query = f"${ticker} lang:en -is:retweet"
    headers = {**HEADERS, "Authorization": f"Bearer {X_BEARER_TOKEN}"}

    try:
        resp = requests.get(
            "https://api.x.com/2/tweets/search/recent",
            headers=headers,
            params={
                "query": query,
                "max_results": max(10, min(X_MAX_RESULTS, 100)),
                "tweet.fields": "created_at,author_id,public_metrics,lang",
            },
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            print(f"X/Twitter ${ticker}: HTTP {resp.status_code} {resp.text[:180]}")
            return []
        payload = resp.json()
    except Exception as exc:
        print(f"X/Twitter ${ticker}: SKIP {exc}")
        return []

    now = int(time.time())
    docs = []
    tweets = payload.get("data", [])
    message_volume = len(tweets)
    message_density = round(message_volume / 30, 3)

    for tweet in tweets:
        tweet_id = str(tweet.get("id") or "")
        text = _clean(tweet.get("text", ""))
        if not tweet_id or not text:
            continue
        if f"${ticker}".lower() not in text.lower():
            continue

        sentiment, score = _score_text_sentiment(text)
        created_at = _created_ts(str(tweet.get("created_at") or ""))
        metrics = tweet.get("public_metrics") or {}
        doc_id = hashlib.sha1(f"x:{ticker}:{tweet_id}".encode()).hexdigest()[:24]

        docs.append({
            "id": doc_id,
            "platform": "X/Twitter",
            "source": "X/Twitter",
            "collector": "x_recent_search_cashtag",
            "ticker": ticker,
            "symbol": ticker,
            "title": text[:180],
            "text": text[:1000],
            "content": text[:1000],
            "url": f"https://x.com/i/web/status/{tweet_id}",
            "source_url": "https://api.x.com/2/tweets/search/recent",
            "query": query,
            "cashtag": f"${ticker}",
            "author": tweet.get("author_id", ""),
            "sentiment": sentiment,
            "sentiment_score": score,
            "message_volume": message_volume,
            "message_density": message_density,
            "retweet_count": metrics.get("retweet_count"),
            "reply_count": metrics.get("reply_count"),
            "like_count": metrics.get("like_count"),
            "quote_count": metrics.get("quote_count"),
            "fetched_at": now,
            "created_at": created_at,
            "timestamp": created_at,
        })

    return docs


def _fetch_ticker_social(ticker: str) -> list[dict]:
    return [
        *_fetch_ticker(ticker),
        *_fetch_reddit_ticker(ticker),
        *_fetch_bluesky_ticker(ticker),
        *_fetch_x_ticker(ticker),
    ]


def main() -> None:
    tickers = _load_tickers()
    client = MongoClient(MONGODB_URI)
    db = client[DB_NAME]
    socials = db.socials
    socials.create_index("id", unique=True, sparse=True)
    socials.create_index("platform")
    socials.create_index("ticker")
    socials.create_index("fetched_at")

    found = upserted = modified = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [executor.submit(_fetch_ticker_social, ticker) for ticker in tickers]

        for future in as_completed(futures):
            docs = future.result()
            found += len(docs)
            if docs:
                result = socials.bulk_write([
                    UpdateOne({"id": doc["id"]}, {"$set": doc}, upsert=True)
                    for doc in docs
                ], ordered=False)
                upserted += result.upserted_count
                modified += result.modified_count

    print(f"Social import complete — {found} found, {upserted} new, {modified} updated")
    client.close()


if __name__ == "__main__":
    main()
