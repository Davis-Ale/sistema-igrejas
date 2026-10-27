FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/api-br ./apps/api-br
COPY apps/events-api ./apps/events-api
COPY packages ./packages
COPY deploy/cloud ./deploy/cloud

RUN corepack prepare pnpm@10.30.2 --activate \
  && pnpm install --frozen-lockfile --filter api-br... --filter @sistema-igrejas/events-api... \
  && pnpm --filter @sistema-igrejas/database generate \
  && chmod +x /app/deploy/cloud/api-entrypoint.sh

ENV HOST=0.0.0.0 \
    NODE_ENV=production

ENTRYPOINT ["sh", "/app/deploy/cloud/api-entrypoint.sh"]
