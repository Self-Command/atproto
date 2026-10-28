# Local-only PLC for the workspace dev stack. Not part of upstream services/.
FROM node:24.22-alpine3.23

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs bootstrap.mjs ./

USER node
EXPOSE 3000
ENV PLC_PORT=3000
CMD ["node", "server.mjs"]
