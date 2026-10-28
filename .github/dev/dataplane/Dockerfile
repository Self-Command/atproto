# Local-only dataplane for the workspace dev stack, layered on the bsky image
# so it always matches the AppView commit. Not part of upstream services/.
ARG BSKY_IMAGE=ghcr.io/self-command/atproto-bsky:dev
FROM ${BSKY_IMAGE}

COPY runner.mjs /app/dev-dataplane.mjs

ENV DATAPLANE_PORT=3000
EXPOSE 3000
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "--enable-source-maps", "/app/dev-dataplane.mjs"]
