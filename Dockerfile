# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

# Install ffmpeg and curl for voice processing and health checks
RUN apk add --no-cache ffmpeg curl

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY webapp/package*.json ./webapp/

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY webapp ./webapp
COPY src ./src
COPY tsconfig.json ./

# Install webapp dependencies and build
WORKDIR /app/webapp
RUN npm ci
RUN npm run build

# Build backend
WORKDIR /app
RUN npm run build

# Production stage - smaller final image
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache ffmpeg curl dumb-init

# Use existing node user (already exists in node:18-alpine)
# No need to create user - node user already exists

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
# Skip postinstall script that builds webapp (already built in builder stage)
RUN npm ci --only=production --no-audit --no-fund --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=node:nodejs /app/dist ./dist
COPY --from=builder --chown=node:nodejs /app/public ./public

# Create necessary directories with correct permissions
RUN mkdir -p downloads uploads data && \
    chown -R node:nodejs downloads uploads data

# Switch to non-root user for security
USER node

# Health check to monitor app status
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

