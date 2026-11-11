# Local setup

Requirements: Node 22 or newer, pnpm, Docker.

```bash
pnpm install
pnpm run stack:up      # infra, migrations, build, all five apps
pnpm run stack:down    # stop apps and infra, keep the data
pnpm run stack:reset   # drop the data and start fresh
```

`stack:up` creates `.env` on first run through `scripts/make-local-env.sh`. The file holds throwaway local values, is gitignored and must never be committed. App logs go to `tmp/logs/`.

To run a second copy of the stack on the same machine, set `PORT_OFFSET` and `COMPOSE_PROJECT_NAME` before the first `stack:up`.

## Environment variables

| Name | Used by |
|---|---|
| `COMPOSE_PROJECT_NAME`, `PORT_OFFSET` | docker compose, `scripts/make-local-env.sh` |
| `NODE_ENV` | all apps. Not kept in `.env`, where it would leak into `next build`; `stack:up` sets `production` when it starts the apps |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | `booking`, `room`, migrations |
| `REDIS_HOST`, `REDIS_PORT` | `booking`, `worker` |
| `NATS_PORT` | docker compose |
| `NATS_URL` | `gateway`, `booking`, `room`, `worker` |
| `GATEWAY_PORT`, `WEB_ORIGIN` | `gateway` |
| `WEB_PORT`, `NEXT_PUBLIC_API_URL` | `web` |
