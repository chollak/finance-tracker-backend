# Multi-stage build for smaller production image
FROM node:18-alpine AS builder

# Install build tools and runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    python3 \
    make \
    g++ \
    sqlite \
    sqlite-dev

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY webapp/package*.json ./webapp/

# Install backend dependencies with scripts disabled, then rebuild sqlite3
RUN npm ci --ignore-scripts
RUN npm rebuild sqlite3

# Copy source code
COPY webapp ./webapp
COPY src ./src
COPY scripts ./scripts
COPY tsconfig.json ./

# Install webapp dependencies manually
RUN cd webapp && npm install

# Build webapp with explicit working directory
RUN cd webapp && npm run build

# Build backend
RUN npm run build

# Production stage - smaller final image
FROM node:18-alpine AS production

# Install runtime dependencies and build tools needed for sqlite3
RUN apk add --no-cache \
    ffmpeg \
    curl \
    dumb-init \
    sqlite \
    python3 \
    make \
    g++

# Use existing node user (already exists in node:18-alpine)
# No need to create user - node user already exists

WORKDIR /app

# Copy package files and install production dependencies with sqlite3 rebuild
COPY package*.json ./
# Install production dependencies and rebuild sqlite3
RUN npm ci --only=production --no-audit --no-fund --ignore-scripts && \
    npm rebuild sqlite3 && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts ./scripts

# Create necessary directories with correct permissions
RUN mkdir -p downloads uploads data && \
    chown -R node:node downloads uploads data

# Switch to non-root user for security  
USER node

# Health check to monitor app status
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

