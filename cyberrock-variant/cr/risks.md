# Risk catalogue

Bug classes that shipped in earlier work. Every feature and change lists each ID once in its `## Risks` table: `yes` with the task that tests it, or `no` with the reason. Side: `be` backend, `fe` frontend.

## R-01 Explicit null on an optional input (be)
- Ask: which optional fields can arrive as `null`, and what do the parser and the `??` or `COALESCE` fallback do with it?
- Rule: optional means absent. Reject `null` at the DTO, or handle it as a named case.
- Test: send `null` for every optional field; assert rejection or the stated result. Cover both sides of every fallback.

## R-02 Read-modify-write outside the guard (be)
- Ask: is any value read before the lock or transaction and written back inside it?
- Rule: read, merge and write inside the same transaction that takes the lock.
- Test: two partial updates of different fields on one record; both survive.

## R-03 Side effect after commit with no recovery (be)
- Ask: what happens if the queue, bus or mail call fails, hangs, or the process dies after commit?
- Rule: give the call a timeout, never swallow its failure silently, and state the recovery path (outbox, sweep or replay). A consumer must be safe to run twice.
- Test: make the side effect fail and hang; assert the recorded state and the retry path.

## R-04 Date-time without an offset (be)
- Ask: how is `2030-01-07T09:00` read, and does the answer depend on the server's time zone?
- Rule: reject offset-less input or define it as UTC, in one helper used everywhere.
- Test: the same input under two `TZ` values gives the same instant.

## R-05 Validator and parser disagree (be)
- Ask: does the validator accept any form the parser reads differently?
- Rule: validate and parse with the same strict grammar.
- Test: unusual but valid forms (ordinal or week dates, extra precision, other case) are rejected or parsed to the right value.

## R-06 Equality on non-normalised input (be)
- Ask: is a hash, fingerprint or uniqueness check computed on raw strings?
- Rule: parse and normalise before hashing or comparing.
- Test: two spellings of the same value are treated as equal.

## R-07 Unbounded growth (be)
- Ask: which rows, keys or jobs are written and never removed?
- Rule: give each a TTL or retention setting, or record the decision to keep it in Design.
- Test: assert the retention setting.

## R-08 Invariant only in application code (be)
- Ask: does the invariant still hold if one write path forgets the check or the lock?
- Rule: back it with a database constraint (unique, check, exclusion). Keep the application check for the friendly error and map the constraint error to the same answer.
- Test: write a violating row directly; the database refuses.

## R-09 Guarantee tested only against mocks (be)
- Ask: is a lock, transaction, constraint or raw SQL statement covered only by specs that mock the database?
- Rule: one integration spec against the real database for each such guarantee.
- Test: concurrent requests against the real database; exactly one wins.

## R-10 A test that locks in a bug (be)
- Ask: does any spec assert that an error is swallowed, ignored or that data is dropped?
- Rule: assert the behaviour a requirement states, never the current accident.
- Test: each "does not throw" or "is ignored" assertion names its requirement ID.

## R-11 One rule, two homes (be, fe)
- Ask: is the same rule implemented in two layers, two paths (create and update) or two forms?
- Rule: one function or schema per rule, called from every path.
- Test: the rule's spec exercises it through each caller.

## R-12 Hand-kept copy of the schema (be)
- Ask: is there a column list, row mapper or transaction scaffold written by hand where the ORM provides it?
- Rule: use the ORM API; raw SQL only where the ORM cannot express the statement, and then never with a hand-kept column list.
- Test: none; reviewed in the diff.

## R-13 Dead data (be)
- Ask: is any new column, field or option written and never read?
- Rule: do not add it.
- Test: none; a reader exists for every new column.

## R-14 Client retry identity (fe)
- Ask: when a request times out or returns 5xx or "in progress", does the retry carry the same idempotency key?
- Rule: keep the key until the user changes the payload; drop it only after a final answer.
- Test: a 503 then a retry sends the same key; an edit then a submit sends a new one.

## R-15 List state after a mutation (fe)
- Ask: after deleting the last row of the last page, where is the user?
- Rule: refetch after every mutation and step back to the last non-empty page.
- Test: delete the only row on page N; page N-1 shows.

## R-16 Hardcoded fetch cap (fe)
- Ask: does a list or a select silently stop at a literal limit?
- Rule: page through, or show that the list is cut.
- Test: more items than the cap; all are reachable or the cut is visible.

## R-17 Precision lost on a round trip (fe)
- Ask: does editing one field rewrite another through a lossy format?
- Rule: send only the fields the user changed; never reformat a value the user did not touch.
- Test: edit one field of a record whose other values carry full precision; they are unchanged.
