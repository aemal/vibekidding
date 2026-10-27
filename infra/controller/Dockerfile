FROM docker:28-cli AS docker-cli
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
WORKDIR /controller
COPY infra/controller/ ./
ENV PORT=4000 VIBEKIDDING_DATA_DIR=/var/lib/vibekidding
EXPOSE 4000
CMD ["node", "server.mjs"]
