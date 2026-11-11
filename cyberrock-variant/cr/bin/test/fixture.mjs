import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const RISKS = `# Risks

## R-01 Null on optional input
- Ask: which optional fields can be null?

## R-02 Read-modify-write outside the guard
- Ask: is anything read before the lock?
`;

export const SPEC = `# bookings-api

## BK-001: List bookings
The system SHALL list bookings.
- Scenario: empty. WHEN no booking exists THEN the list is empty
`;

export const FEATURE = `# add-notes: Add booking notes

Tier: change
Why this tier: extends the bookings capability

## Why
Users need notes.

## Requirements
### ADDED bookings-api
#### BK-002: Store a note
The system SHALL store a note of at most 200 characters.
- Scenario: too long. WHEN the note has 201 characters THEN the answer is 400
### MODIFIED bookings-api
#### BK-001: List bookings
The system SHALL list bookings with their notes.
- Scenario: with note. WHEN a booking has the note "x" THEN the list shows "x"

## Design
- The note is validated in the DTO only.

## Risks
| Risk | Applies | Note | Task |
|---|---|---|---|
| R-01 | yes | note is optional | T02 |
| R-02 | no | no partial update | - |

## Tasks
- [ ] T01 @be [BK-002] Add the column and DTO field | apps/api/note.ts, apps/api/note.spec.ts
- [ ] T02 @be [BK-002, R-01] Reject null notes | apps/api/note.dto.ts
- [ ] T03 @fe [BK-001] Show the note in the list | apps/web/list.tsx
- [ ] T04 @main [verify] Build, lint, test
`;

export const FIX = `# fix-paging: Wrong rows on page 2

Tier: fix
Why this tier: paging contradicts the contract

## Cause
The offset uses the default page size (apps/api/list.ts:19).

## Tasks
- [ ] T01 @be [regression] Failing spec for page 2 | apps/api/list.spec.ts
- [ ] T02 @be [regression] Use the requested limit | apps/api/list.ts
`;

export const makeRepo = (files = {}) => {
  const root = mkdtempSync(join(tmpdir(), 'cr-'));
  const all = { 'cr/risks.md': RISKS, 'cr/specs/bookings-api.md': SPEC, ...files };
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
};
