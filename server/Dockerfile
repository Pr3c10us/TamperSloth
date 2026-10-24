FROM oven/bun:1.4.4-alpine AS base

# Set working directory
WORKDIR /app

# Copy package files first (for better caching)
COPY package.json bun.lock ./

# Install dependencies (include dev for build)
RUN bun install --frozen-lockfile

# Copy the rest of the source code
COPY . .

# 2️⃣ Runtime image
FROM oven/bun:1.4.4-alpine AS prod

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

# Expose your Express port
EXPOSE 5000

# Use a non-root user (recommended)
USER appuser

# Start the app
CMD ["sh", "-c", "bun start"]