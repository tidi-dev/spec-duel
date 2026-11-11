# Browser walk-through: Spec Kit variant, change 1

Date: 2026-11-10 · `http://localhost:4220/bookings` against the live stack, after the acceptance run.

| Check | Result |
|---|---|
| "Bookings" link in the navigation | Present |
| Table of bookings (title, room name, organizer, start, end, confirmation) | Shown, with real data and `SENT` statuses; times in local time |
| Room filter | Rendered ("All rooms"); not operated |
| Create form (room, title, organizer email, start, end) | Rendered; not submitted in the browser |
| Edit / Delete | Buttons present per row; not operated |

Reduced scope: the page was loaded and inspected only. Create, edit, delete and the filter were not driven through the browser; they are covered by the variant's own page tests and, on the API side, by the acceptance suite. (In the OpenSpec variant, delete was additionally exercised.)
