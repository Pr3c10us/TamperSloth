FROM oven/bun:alpine AS base

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package.json bun.lock ./
COPY patches ./patches

# Install dependencies (include dev for build)
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# 2️⃣ Runtime image
FROM oven/bun:alpine AS prod

WORKDIR /app

# Create the appuser BEFORE chown
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy only what's needed from builder
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/bun.lock ./bun.lock
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/migrate.cjs ./migrate.cjs
COPY --from=base /app/migrations ./migrations

# Copy the rest of the source code
COPY . .

# Create uploads directory and set permissions
RUN mkdir -p /app/uploads && \
    mkdir -p /app/public/temp && \
    chown -R appuser:appgroup /app/uploads && \
    chown -R appuser:appgroup /app/public

# Expose your Express port
EXPOSE 5000

# Use a non-root user (recommended)
USER appuser

# Start the app
CMD ["sh", "-c", "bun start"]