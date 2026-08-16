FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY server.js ./
COPY ticket-pdf.js ./
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data/uploads && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_FILE=/app/data/db.json
ENV UPLOAD_DIR=/app/data/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
