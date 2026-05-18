# Testing Strategy

## Phases

### Phase 1 — Unit Tests (Current Priority)

Set up Vitest across all packages and apps for fast, isolated tests.

**Steps:**
1. Add `vitest` as a root dev dependency
2. Create `vitest.config.ts` in each package/app
3. Add `"test": "vitest run"` script to each package
4. Add root script: `"test:unit": "pnpm -r --filter='!@tests/e2e' run test"`
5. Write unit tests co-located with source (`src/**/*.test.ts`)

**Scope:**
- `packages/db` — repository helpers, query logic
- `packages/queue` — job creation, event handling
- `packages/storage` — upload/download logic (mocked S3)
- `apps/api` — route handlers, validation, middleware
- `apps/worker` — job processors, error handling
- `apps/web` — React components, hooks

---

### Phase 2 — Integration Tests

Test interactions between packages with real (or containerized) dependencies.

**Steps:**
1. Add integration test configs that use longer timeouts
2. Use `testcontainers` or Docker Compose for Postgres/Redis
3. Test database migrations + seed data
4. Test queue publish → consume flows

---

### Phase 3 — E2E Tests

Validate the full application stack end-to-end.

**Steps:**
1. Create `tests/` workspace package (`@tests/e2e`)
2. Add to `pnpm-workspace.yaml`
3. Use Playwright for web UI tests
4. Use Vitest + `fetch` for API contract tests
5. Add root script: `"test:e2e": "pnpm --filter @tests/e2e run test"`
6. Test full render flow: upload → queue → worker → output

---

## Directory Structure (Target)

```
├── apps/
│   ├── api/src/**/*.test.ts          ← unit tests
│   ├── web/app/**/*.test.tsx         ← component tests
│   └── worker/src/**/*.test.ts       ← unit tests
├── packages/
│   ├── db/src/**/*.test.ts           ← unit tests
│   ├── queue/src/**/*.test.ts        ← unit tests
│   └── storage/src/**/*.test.ts      ← unit tests
├── tests/                            ← e2e (Phase 3)
│   ├── package.json
│   ├── playwright.config.ts
│   ├── vitest.e2e.config.ts
│   └── e2e/
│       ├── api/
│       ├── render-flow/
│       └── web/
```

## CI Workflows

| Workflow | Trigger | Phase |
|----------|---------|-------|
| `ci.yml` | Push/PR to main | Orchestrator — runs lint, then unit, then e2e |
| `unit-tests.yml` | Reusable / direct | Phase 1 |
| `e2e-tests.yml` | Reusable / direct | Phase 3 |

## Scripts (to add to root package.json)

```json
{
  "test:unit": "pnpm -r --filter='!@tests/e2e' run test",
  "test:e2e": "pnpm --filter @tests/e2e run test",
  "test": "pnpm test:unit && pnpm test:e2e"
}
```
