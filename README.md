# 3D Room Platform Monorepo

Production-minded monorepo bootstrap for a 3D rendering e-commerce flow.

## Architecture

- apps/web: Next.js UI that submits render jobs and polls for completion.
- apps/api: Express API that persists requests and enqueues async jobs.
- apps/worker: BullMQ worker that calls the Python renderer and updates job state.
- services/renderer: Blender-compatible Python renderer script.
- packages/types: Shared TypeScript contracts.
- packages/db: Prisma schema + client wrapper.
- packages/queue: Shared BullMQ queue and Redis connection config.

The queue isolates slow rendering from request/response APIs and allows horizontal worker scaling.

## Folder Structure

```text
.
├── apps
│   ├── api
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── web
│   │   ├── app
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── next-env.d.ts
│   │   ├── next.config.mjs
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── worker
│       ├── package.json
│       ├── src
│       │   └── index.ts
│       └── tsconfig.json
├── docker-compose.yml
├── package.json
├── packages
│   ├── db
│   │   ├── package.json
│   │   ├── prisma
│   │   │   └── schema.prisma
│   │   ├── src
│   │   │   ├── client.ts
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── queue
│   │   ├── package.json
│   │   ├── src
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── types
│       ├── package.json
│       ├── src
│       │   └── index.ts
│       └── tsconfig.json
├── pnpm-workspace.yaml
├── services
│   └── renderer
│       ├── output
│       └── render.py
└── tsconfig.base.json
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker
- Python 3.10+
- Blender with bpy support (optional for true 3D render; script has a local fallback)

## Setup

1. Install dependencies:
   - pnpm install
2. Start infrastructure:
   - docker compose up -d
3. Copy env file:
   - cp .env.example .env
4. Generate Prisma client and migrate:
   - pnpm db:migrate

## Run Services

In separate terminals:

- pnpm dev:api
- pnpm dev:worker
- pnpm dev:web

Endpoints:

- API: http://localhost:4000
- Web: http://localhost:3000

## Flow

1. Click "Generate Room" in the web app.
2. Web app calls POST /render on API.
3. API stores a render request and pushes a BullMQ job.
4. Worker consumes the job, calls Python renderer, updates DB.
5. Web app polls GET /render/:id until status is done.
