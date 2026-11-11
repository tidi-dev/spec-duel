/cr-apply

Implementation note for this step: do the backend and the frontend work in parallel. Delegate the backend tasks (`apps/gateway`, `apps/booking`, `apps/worker`, `libs/backend-common`) to the `nestjs-expert` agent and the frontend tasks (`apps/web`) to the `nextjs-fe-developer` agent, started at the same time. `libs/contract` is read-only for both. The frontend builds against the contract with its service layer mocked in tests. When both are finished, run `pnpm run build`, `pnpm run lint` and `pnpm run test` together and fix what fails.
