#!/usr/bin/env bash
cd "$(dirname "$0")"
docker compose down
if [ -f logs/bridge.pid ] && kill "$(cat logs/bridge.pid)" 2>/dev/null; then
  echo "Đã dừng bridge"
fi
rm -f logs/bridge.pid
