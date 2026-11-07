#!/usr/bin/env bash
# Khởi động bridge Claude trên máy Mac + container web.
set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] || cp .env.example .env
if ! grep -qE '^BRIDGE_TOKEN=.{16,}' .env; then
  token=$(openssl rand -hex 24)
  if grep -q '^BRIDGE_TOKEN=' .env; then
    sed -i '' "s/^BRIDGE_TOKEN=.*/BRIDGE_TOKEN=${token}/" .env
  else
    echo "BRIDGE_TOKEN=${token}" >> .env
  fi
  echo "Đã tạo BRIDGE_TOKEN mới trong .env"
fi

PORT=$(grep -E '^BRIDGE_PORT=' .env | cut -d= -f2); PORT=${PORT:-4871}
WEB=$(grep -E '^HOST_PORT=' .env | cut -d= -f2); WEB=${WEB:-4870}
mkdir -p logs

if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
  echo "Bridge đã chạy sẵn ở cổng ${PORT}"
else
  CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude)}" nohup node bridge/bridge.js >> logs/bridge.log 2>&1 &
  echo $! > logs/bridge.pid
  sleep 1
  curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null && echo "Bridge chạy ở cổng ${PORT} (log: logs/bridge.log)" \
    || { echo "Bridge không khởi động được, xem logs/bridge.log"; exit 1; }
fi

docker compose up -d --build
echo "Mở http://localhost:${WEB} bằng Chrome"
