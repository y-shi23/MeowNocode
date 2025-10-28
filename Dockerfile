# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

ARG VITE_SELF_HOSTED=true
ENV VITE_SELF_HOSTED=$VITE_SELF_HOSTED

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ARG VITE_SELF_HOSTED=true
ENV NODE_ENV=production
ENV VITE_SELF_HOSTED=$VITE_SELF_HOSTED

RUN apk add --no-cache su-exec

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/d1-schema.sql ./d1-schema.sql
COPY docker-entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

RUN npm prune --omit=dev

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

ENV PORT=3000
ENV SQLITE_DB_PATH=/data/meownocode.db

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
