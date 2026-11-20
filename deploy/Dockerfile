FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm install --no-audit --no-fund
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --gid 10001 suportai && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin suportai
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=10001:10001 /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=10001:10001 /app/apps/api/bin ./apps/api/bin
COPY --from=build --chown=10001:10001 /app/apps/api/sql ./apps/api/sql
USER 10001:10001
EXPOSE 4000
CMD ["node","apps/api/dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
