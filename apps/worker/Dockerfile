FROM node:20-slim

# Enable non-free repo (required for blender on Debian Bookworm) and install dependencies.
# Blender headless requires libglu1-mesa + X11/render libs even in -b (background) mode.
RUN echo "deb http://deb.debian.org/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list \
    && apt-get update && apt-get install -y \
    python3 \
    openssl \
    blender \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libxxf86vm1 \
    && rm -rf /var/lib/apt/lists/* \
    && blender --version

# Install Python deps (openai) into Blender's embedded Python interpreter.
# 'blender -b --python-expr' runs code inside Blender's own Python, not system Python.
COPY services/renderer/requirements.txt /tmp/renderer-requirements.txt
RUN blender -b --python-expr \
    "import subprocess, sys; subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', '/tmp/renderer-requirements.txt'])"

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Copy workspace configs and lock file
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

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
RUN pnpm --filter @repo/db exec prisma generate

# Create output directory for rendered images
RUN mkdir -p /app/services/renderer/output

CMD ["pnpm", "--filter", "@apps/worker", "start"]
