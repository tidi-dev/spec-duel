# roombook — local agent setup

roombook is a small meeting-room bookings system: an HTTP gateway, two NATS services, a BullMQ worker and a Next.js frontend in one Nx monorepo. The domain and all data are synthetic.

Shared engineering rules live in `/workspace/.claude/rules/`. Security rules: `.claude/rules/security.md`.

## Agent skills

### Issue tracker

None. Git is local only: no remote, no push, no pull requests.

### Domain docs

Single-context. The references are `README.md`, `docs/local-setup.md` and the shared contract in `libs/contract`.

### Engineering flow

- Changes go through the cyberrock kit: `/cr-propose <brief>` writes `cr/changes/<id>/change.md`; `/cr-apply` implements, reviews and archives it. A bugfix is finished by `/cr-propose` alone. Project rules: `cr/rules.md`. Risk catalogue: `cr/risks.md`. Current behaviour: `cr/specs/`.
- `cr-nestjs-expert` → backend work; `cr-nextjs-fe-developer` → `apps/web`; `cr-reviewer` → read-only review of a diff.
- `node cr/bin/cr.mjs validate --strict` is the gate that needs no AI.
