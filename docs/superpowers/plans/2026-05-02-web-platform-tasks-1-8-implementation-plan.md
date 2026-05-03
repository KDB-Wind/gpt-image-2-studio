# Web Platform Tasks 1-8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MVP backend foundation for the hosted web image platform while preserving a separate lightweight basic tool path.

**Architecture:** Keep shared, platform-neutral image generation capabilities in packages. Keep user, credit, payment, admin, queue, and health state behind the hosted API and worker. Use tests around pure services and adapters so the MVP can be verified without requiring live PostgreSQL, Redis, or a real provider in this environment.

**Tech Stack:** TypeScript, Vitest, Fastify, BullMQ, PostgreSQL schema metadata via Drizzle, OpenAI-compatible provider adapter, local filesystem image storage, Markdown deployment docs.

---

## File Structure

- `packages/platform-db/src/schema.ts`: Drizzle table definitions and `platformTables`.
- `packages/platform-db/src/repository.ts`: repository contracts and shared domain types.
- `packages/platform-db/src/inMemoryRepository.ts`: tested in-memory implementation used by services and unit tests.
- `packages/platform-db/src/drizzleRepository.ts`: PostgreSQL/Drizzle repository factory and SQL-backed method skeletons.
- `apps/api/src/services/*`: hosted API services for auth, credits, queue creation, health status, template sync, and admin actions.
- `apps/api/src/routes/*`: Fastify route registration for jobs, auth, credits, health, templates, payments, admin.
- `apps/worker/src/*`: BullMQ worker factory plus pure generation and health probe handlers.
- `packages/provider/src/*`: OpenAI-compatible image adapter with text-to-image and image-to-image request support.
- `packages/image-config/src/*`: image size, quality, resolution, timeout, and upload-limit validation.
- `packages/prompt-templates/src/*`: shared prompt template catalog, rendering, and validation.
- `docs/deployment/4c4g-linux-platform.md`: deployment plan for a 4C4G Linux server with 2C2G project budget.

## Task 1: PostgreSQL/Drizzle Persistence

- [ ] Write failing tests for table coverage and repository behavior.
- [ ] Install Drizzle dependencies with `npm_config_cache=D:\npm-cache`.
- [ ] Implement schema, repository types, in-memory parity, and Drizzle repository entrypoint.
- [ ] Run `npm run platform:test`.

## Task 2: Redis/BullMQ Queue

- [ ] Write failing tests for queue job creation and worker option mapping.
- [ ] Implement queue adapter and worker factory.
- [ ] Wire API enqueue dependency through a real BullMQ queue factory.
- [ ] Run queue tests and `npm run platform:test`.

## Task 3: Provider Adapter And Circuit Integration

- [ ] Write failing tests for OpenAI-compatible payloads, multi-image inputs, empty image response classification, and timeout handling.
- [ ] Implement `packages/provider`.
- [ ] Implement `packages/image-config`.
- [ ] Wire worker handler to provider adapter without retrying other same-provider keys on cost-risk failures.
- [ ] Run provider, worker, and platform tests.

## Task 4: User System

- [ ] Write failing tests for email code issue, login verification, lockout, session creation, and admin disable.
- [ ] Implement auth service and API routes using repository methods.
- [ ] Add repository support for verification codes and sessions.
- [ ] Run auth and platform tests.

## Task 5: Credit System

- [ ] Write failing tests for daily free grant, success debit, no-debit failures, admin credit, and ledger visibility.
- [ ] Implement credit service and repository methods.
- [ ] Ensure generation worker only debits after provider success.
- [ ] Run credit, worker, and platform tests.

## Task 6: Health Monitoring

- [ ] Write failing tests for one-key probe scheduling, configurable intervals, and status summaries.
- [ ] Implement health service, settings access, health events, and status route.
- [ ] Ensure probes do not fan out across all 10 same-provider keys.
- [ ] Run health and platform tests.

## Task 7: Prompt Template Library

- [ ] Write failing tests for template validation, rendering, category filtering, and platform sync.
- [ ] Implement shared template package with curated templates.
- [ ] Add platform service to sync and manage templates in repository.
- [ ] Run template and platform tests.

## Task 8: Deployment Plan

- [ ] Add deployment documentation for Nginx, API, Worker, PostgreSQL, Redis, image storage, env vars, secrets, backups, logs, and restart strategy.
- [ ] Add capacity notes for a 4C4G server with 2C2G project budget.
- [ ] Run documentation checks via build/test commands.

## Final Verification

- [ ] Run `npm run platform:test`.
- [ ] Run `npm run test:run`.
- [ ] Run `npm run build`.
- [ ] Review `git diff --stat` and summarize residual risks.
