FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build


FROM node:22-alpine AS runtime

RUN corepack enable && apk add --no-cache ca-certificates tini wget

ENV NODE_ENV=production \
    DOCKER_SOCKET_PATH=/var/run/docker.sock \
    NEXPLOY_AGENT_HEALTH_PORT=9091

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile && pnpm store prune

COPY --from=builder /app/dist ./dist

EXPOSE 9091

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O- http://127.0.0.1:9091/readyz > /dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
