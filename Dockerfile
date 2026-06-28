# ──────────────────────────────────────────────────
# Stage 1: Build
# ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for TypeScript)
RUN npm ci

# Copy source and config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to dist/
RUN npm run build

# ──────────────────────────────────────────────────
# Stage 2: Production
# ──────────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S mcpuser && \
    adduser -S mcpuser -u 1001 -G mcpuser

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built output from builder stage
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER mcpuser

# Expose MCP HTTP port
EXPOSE 3100

# Health check -- lightweight wget probe against the /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3100/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV MCP_PORT=3100

# Start HTTP transport
CMD ["node", "dist/http-transport.js"]
