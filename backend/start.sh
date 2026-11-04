#!/usr/bin/env bash
# Starts every backend inside the single container.
# If any process exits, the container exits and Render restarts it.
set -euo pipefail

# Fynd API: internal only (127.0.0.1:4001)
(
  cd /app/fynd
  ./node_modules/.bin/prisma migrate deploy
  exec node dist/index.js
) &

# Add more backends here, each on its own internal port, then register them in
# backend/central/src/services.ts. Examples:
# (cd /app/py-proto && PYTHONPATH=deps exec python -m uvicorn main:app --host 127.0.0.1 --port 5001) &
# (cd /app/go-proto && PORT=5002 exec ./app) &

# Central gateway: the only public process (listens on $PORT from Render)
(
  cd /app/central
  exec node dist/index.js
) &

wait -n
exit $?
