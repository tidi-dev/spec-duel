# roombook acceptance suite

Black-box HTTP tests against a running gateway. Frozen once the baseline is tagged.

```bash
GATEWAY_URL=http://localhost:3100/api pnpm test -- --selectProjects baseline change-1
```

Groups: `baseline` (health, room list), `change-1` (bookings, idempotent create, confirmation job),
`change-2` (no overlapping bookings), `change-3` (room list paging with a custom page size).

Tests run one at a time. Every booking takes a fresh time slot from `src/support/slots.ts`, so groups do not
interfere with each other.
