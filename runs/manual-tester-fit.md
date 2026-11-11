# Fit check: each kit's change-1 specification as a source for `manual-tester`

Date: 2026-11-10. The same agent and method, given each kit's specification for change 1 instead of a Jira ticket. Figures are as reported by the agent; the test-case files are in `runs/<kit>/manual-tester/ROOMBOOK-1.md`.

| | OpenSpec (4 archived main specs, 477 lines) | Spec Kit (`spec.md`, 217 lines) |
|---|---|---|
| Requirements extracted | 33 | 59 |
| Covered by at least one test case | 28 | 53 |
| Not coverable by a manual tester | 5 | 6 |
| Test cases written | 93 (29 high, 52 medium, 12 low) | 81 (31 high, 38 medium, 12 low) |
| Assumptions / open questions | 9 / 17 | 11 / 18 |
| Agent time and tokens | 349 s, 76,608 tokens | 368 s, 75,318 tokens |

## What the agent said about OpenSpec's specs
- One requirement per `### Requirement:` block with SHALL wording: extraction was almost mechanical.
- WHEN/THEN scenarios carry concrete values, so most became a test case with no guessing; negative cases were already there.
- No requirement or scenario IDs. The agent invented R1 to R33, and some titles repeat across specs, so a title alone is ambiguous.
- Several blocks mix observable behaviour with internal design, which had to be split by hand.
- The page spec is written as request behaviour ("one create request is sent"), so 12 page cases need the browser's network tab.

## What the agent said about Spec Kit's spec
- Stable IDs (FR-001 to FR-035, numbered acceptance scenarios, SC-001 to SC-007) made the coverage table nearly mechanical.
- The same rule appears in up to four places (requirements, acceptance scenarios, edge cases, success criteria) with no cross-references; de-duplication was manual.
- About 24 requirements exist only in Edge Cases and Assumptions, which have no IDs; reading the FR list alone would miss them.
- Roughly a fifth of the FRs are implementation or build constraints that cannot be tested from outside.

## Gaps common to both
- No on-screen wording (labels, buttons, messages), so UI cases carry "To confirm".
- No environment or test-data information (addresses, existing rooms, how to reset data).
- Concurrency and queue behaviour are specified but not reproducible by hand.
