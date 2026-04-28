FROM node:20-slim

# Install Python (needed for renderer)
RUN apt-get update && apt-get install -y python3 && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace configs and lock file
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy packages needed by Worker
COPY packages/types packages/types
COPY packages/db packages/db
COPY packages/queue packages/queue

# Copy Worker app
COPY apps/worker apps/worker

# Copy renderer service
COPY services/renderer services/renderer

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @repo/db prisma generate

# Create output directory for rendered images
RUN mkdir -p /app/services/renderer/output

CMD ["pnpm", "--filter", "@apps/worker", "dev"]
