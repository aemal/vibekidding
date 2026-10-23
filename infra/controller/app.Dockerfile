FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
ARG APP_BASE_PATH=/
ENV VITE_BASE=$APP_BASE_PATH BASE_PATH=$APP_BASE_PATH NEXT_PUBLIC_BASE_PATH=$APP_BASE_PATH
RUN npm run build --if-present
RUN chown -R node:node /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 HOSTNAME=0.0.0.0 DATA_DIR=/data
USER node
EXPOSE 3000
CMD ["npm", "start"]
