# roombook

A small meeting-room bookings system used as a demo codebase. The domain is synthetic.

| App | Role |
|---|---|
| `apps/gateway` | HTTP API under `/api`; forwards to the services over NATS |
| `apps/booking` | Bookings service (NATS, Postgres, BullMQ producer) |
| `apps/room` | Rooms service (NATS, Postgres) |
| `apps/worker` | BullMQ worker (Redis) |
| `apps/web` | Next.js frontend |

Shared code: `libs/contract` (DTOs, routes, patterns, error codes) and `libs/backend-common` (config, database, NATS client, errors).

See `docs/local-setup.md` to run it locally.
