---
name: lean-change
description: Smallest-complete-change discipline for writing, fixing or refactoring code in roombook (NestJS, Next.js, TypeORM). Use when the user says "lean", "simplest solution", "yagni", "be lazy", or complains about over-engineering or bloat. Levels lite, full (default), ultra. Adapted from Ponytail (MIT).
argument-hint: "[lite|full|ultra]"
---

# Lean change

Solve the whole task with the least new code. The best code is the code never written. End the reply with one or two lines: what you skipped or did not check, and any risk the user must know.

This skill is active for the current task only. There is no session flag, hook or config file.

## Before you write

Read the task and the code it touches. List every place the change must reach: callers, specs, fixtures, migrations, `libs/contract` routes and message patterns, Nx project config. Check what the change could break: data a migration would destroy, NATS callers that stop matching, web pages reading a changed DTO. That is the scope. Extra features are not.

## The smallest complete change

Take the first option that fully works:

1. Does it need to exist? Skip features, options and flexibility nobody asked for, and name them in one line.
2. Already in this codebase? Reuse it the way the surrounding code does: `libs/backend-common` (config, database, errors, NATS client), `libs/contract` (DTOs, routes, error codes), existing services and components.
3. A platform or framework feature? Use it: class-validator on DTOs, TypeORM query builder and constraints, NestJS pipes and filters, MUI components, react-hook-form with yup.
4. An installed dependency? Use it. Never add a dependency for a few lines, and never install one without the approval required by `.claude/rules/security.md` section 4.
5. Can it be one line a reader gets at a glance? One line.
6. Otherwise: the minimum code that works.

- Be lean about the solution, never about the change: finish every part it needs, including the callers, specs and fixtures it breaks.
- No abstraction, wrapper, option, config or "for later" code nobody asked for. Keep the existing layers: controller → service → repository, gateway → NATS → service.
- The shortest working diff wins once you know everything it must touch. A one-liner that needs decoding is not short.
- Comments follow the repo rule: only a non-obvious constraint, one short line.
- Bug fix: grep every caller of the function you touch, then fix the root cause once, in the shared code.
- Code you move or merge keeps its validation and error handling.
- Between options of equal size, take the one correct on edge cases (empty, last page, time zones, concurrent requests).
- New non-trivial logic (a branch, a parser, a query, a data write) gets one focused spec. Trivial changes need none.
- A shortcut with a known limit gets a comment in this form: `shortcut: <the limit>, <when to upgrade>`. `lean-debt` collects them.

Never cut: validation at trust boundaries (gateway DTOs), error handling that prevents data loss, transactions and constraints that keep data consistent, security, accessibility, anything the user asked for, the hard gates in `/workspace/.claude/rules/RULES.md`.

## Levels

| Level | Behaviour |
|---|---|
| **lite** | Build what was asked. Name the smaller option in one line and let the user pick. |
| **full** | The rules above. Default. |
| **ultra** | Also question the request: before building, push back on any part the need does not justify. |

The repo rule "never assume" still wins: when a choice changes behaviour or scope, ask.
