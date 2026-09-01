# Multi-stage Dockerfile for Hung Vuong Concert Scheduler
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY templates ./templates
COPY static ./static
COPY data ./data

# Expose server port
EXPOSE 3000

CMD ["node", "dist/server.cjs"]
