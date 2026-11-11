# Browser walk-through: OpenSpec variant, change 1

Date: 2026-11-10 · `http://localhost:4210/bookings` against the live stack, after the acceptance run.

| Check | Result |
|---|---|
| "Bookings" link in the navigation | Present |
| Table of bookings (title, room name, organizer, start, end, confirmation) | Shown, with real data and `SENT` / `FAILED` statuses |
| Room filter | Rendered ("All rooms"); not operated |
| Create form (room, title, organizer email, start, end) | Rendered; not submitted in the browser |
| Edit | Button present per row; not operated |
| Delete | Confirmation dialog, then the row disappears from the list |

Reduced scope: create, edit and the filter were not driven through the browser. They are covered by the variant's own page tests and, on the API side, by the acceptance suite.
