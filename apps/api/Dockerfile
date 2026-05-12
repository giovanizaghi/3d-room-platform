FROM node:20-slim

# Install openssl (Prisma) and curl (healthcheck)
RUN apt-get update && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace configs and lock file
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy packages needed by API
COPY packages/types packages/types
COPY packages/db packages/db
COPY packages/queue packages/queue

# Copy API app
COPY apps/api apps/api

# Copy renderer service (chair.blend used for auto-seeding on first boot)
COPY services/renderer services/renderer

# Install dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm --filter @repo/db exec prisma generate

EXPOSE 4000

CMD ["pnpm", "--filter", "@apps/api", "start"]
