# roombook — local agent setup

roombook is a small meeting-room bookings system: an HTTP gateway, two NATS services, a BullMQ worker and a Next.js frontend in one Nx monorepo. The domain and all data are synthetic.

Shared engineering rules live in `/workspace/.claude/rules/`. Security rules: `.claude/rules/security.md`.

## Agent skills

### Issue tracker

None. Git is local only: no remote, no push, no pull requests.

### Domain docs

Single-context. The references are `README.md`, `docs/local-setup.md` and the shared contract in `libs/contract`.

### Engineering flow

- `test-driven-development` and `verification-before-completion` → while implementing.
- `nestjs-expert` → backend work; `nextjs-fe-developer` → `apps/web`.
