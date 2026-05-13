FROM node:20-slim

# System libraries required by Blender headless (no blender from apt — Bookworm only has 3.4,
# which lacks BLENDER_EEVEE_NEXT and has .blend compatibility issues with 4.x files).
RUN apt-get update && apt-get install -y \
    python3 \
    openssl \
    curl \
    xz-utils \
    libglu1-mesa \
    libxi6 \
    libxrender1 \
    libxxf86vm1 \
    libxfixes3 \
    libgl1 \
    libxkbcommon0 \
    libsm6 \
    libice6 \
    && rm -rf /var/lib/apt/lists/*

# Download Blender 4.2 LTS from the official Blender Foundation mirror.
ARG BLENDER_VERSION=4.2.0
RUN curl -fSL "https://download.blender.org/release/Blender4.2/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
    | tar -xJ -C /opt \
    && ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender \
    && blender --version

# Install Python deps (openai) into Blender's own embedded Python (not system Python).
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
COPY packages/storage packages/storage

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
