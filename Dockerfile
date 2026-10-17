# syntax=docker/dockerfile:1.6
# Multi-stage build for the Unlimited Google Storage app.

# --- 1. deps ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- 2. build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# --- 3. runtime ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public 2>/dev/null || true
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1
CMD ["npx", "next", "start"]
