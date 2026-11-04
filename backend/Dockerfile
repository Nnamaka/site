# syntax=docker/dockerfile:1.7
# Builds every backend into ONE image for a single Render web service.
# Build from the repo root:  docker build -f backend/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---------- build ----------
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@nnamaka/central..." --filter "@nnamaka/fynd-api..."
RUN pnpm --filter @nnamaka/fynd-api build \
 && pnpm --filter @nnamaka/central build
RUN pnpm --filter @nnamaka/fynd-api deploy --prod /out/fynd \
 && pnpm --filter @nnamaka/central deploy --prod /out/central \
 && cd /out/fynd && ./node_modules/.bin/prisma generate

# ---------- future non-JS backends ----------
# Python example:
#   FROM python:3.12-slim AS py
#   COPY backend/some-python-proto /py
#   RUN pip install --no-cache-dir -r /py/requirements.txt --target /py/deps
# Go example:
#   FROM golang:1.23 AS go
#   COPY backend/some-go-proto /src
#   RUN cd /src && CGO_ENABLED=0 go build -o /out/go-proto .

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/fynd ./fynd
COPY --from=build /out/central ./central
# COPY --from=go /out/go-proto ./go-proto/app
COPY backend/start.sh ./start.sh
RUN chmod +x ./start.sh
EXPOSE 10000
CMD ["./start.sh"]
