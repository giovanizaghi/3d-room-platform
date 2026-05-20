FROM node:20-slim

# Blender rendering is handled by the dedicated renderer service — this image only needs Node.
# openssl for Prisma, curl for healthchecks.
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace configs and lock file
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy packages needed by Worker
COPY packages/types packages/types
COPY packages/db packages/db
COPY packages/queue packages/queue
COPY packages/storage packages/storage

# Copy Worker app
COPY apps/worker apps/worker

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @repo/db exec prisma generate

# Create output directory for rendered images
RUN mkdir -p /app/services/renderer/output

CMD ["pnpm", "--filter", "@apps/worker", "start"]
