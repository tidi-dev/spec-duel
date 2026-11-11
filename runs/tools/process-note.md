This session runs one step of a spec-driven development kit inside this repository.

- The kit's own workflow is the process for this session. The process rules in the shared rule files (planning with a `planner` agent first, delegating to a `tester` agent, stopping for an owner review gate, stopping to ask before every non-obvious decision) do not apply here. Do not start a second planning or review process on top of the kit's.
- The code standards in those rule files do apply: kebab-case files, DTO classes, no `any`, no `interface`, no inline object parameter types, explicit repository return types, transactions in repositories, files under 200 lines, no narrative comments.
- Never read `.env` or `.env.*` files. Refer to configuration by variable name.
- Git is local only: never add a remote, push or open a pull request.
- If something you need is not specified, choose the simplest option and state it as an assumption in what you write. Ask a question only when the kit's step itself requires an answer to proceed.
