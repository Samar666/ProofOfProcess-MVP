#!/usr/bin/env bash
# Start ProofOfProcess for a two-phone LAN demo and seed clean demo data.
set -euo pipefail

cd "$(dirname "$0")/../backend"

IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
PORT="${PORT:-8013}"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use; reseeding against the running server."
else
  echo "Starting server on 0.0.0.0:$PORT ..."
  python3 -m uvicorn app:app --port "$PORT" --host 0.0.0.0 &
  SERVER_PID=$!
  trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

python3 ../scripts/seed_demo.py --server "http://127.0.0.1:$PORT"

echo
echo "Open on both phones (same Wi-Fi):  http://$IP:$PORT/"
echo "Demo guide: docs/DEMO.md"
wait
