#!/usr/bin/env bash
cd ~/Desktop/"INTEGRATED STOCK PROJECT"/Project/Working_Code
source .venv/bin/activate

while true; do
  echo
  echo "===== PUBLIC SOCIAL COLLECTOR RUN $(date) ====="

  echo "--- Reddit public finance RSS ---"
  MONGO_URI="mongodb://localhost:27017/feedflash" \
  MONGODB_URI="mongodb://localhost:27017/feedflash" \
  python 5_Social/pipeline/fetch_reddit_finance_rss_to_mongo.py

  echo "--- Bluesky public search API ---"
  MONGO_URI="mongodb://localhost:27017/feedflash" \
  MONGODB_URI="mongodb://localhost:27017/feedflash" \
  python 5_Social/pipeline/fetch_bluesky_public_to_mongo.py

  echo "--- StockTwits public symbol streams ---"
  MONGO_URI="mongodb://localhost:27017/feedflash" \
  MONGODB_URI="mongodb://localhost:27017/feedflash" \
  python 5_Social/pipeline/fetch_stocktwits_public_to_mongo.py

  echo "===== 5m rolling social counts ====="
  curl -sS "http://localhost:3001/api/social/rolling/stats?window_minutes=5"
  echo

  sleep 60
done
