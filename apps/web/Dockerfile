FROM node:20-slim

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace configs and lock file
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy packages needed by Web
COPY packages/types packages/types

# Copy Web app
COPY apps/web apps/web

# Install dependencies
RUN pnpm install --frozen-lockfile

EXPOSE 3000

CMD ["pnpm", "--filter", "@apps/web", "dev"]
