FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ARG VIBEKIDDING_RUNTIME_ORIGIN=http://apps.localhost:3000
ENV VIBEKIDDING_RUNTIME_ORIGIN=$VIBEKIDDING_RUNTIME_ORIGIN
RUN npm run build -- --webpack

FROM node:22-bookworm-slim AS studio
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
RUN mkdir -p /var/lib/vibekidding && chown node:node /var/lib/vibekidding
USER node
EXPOSE 3000
CMD ["node", "server.js"]
