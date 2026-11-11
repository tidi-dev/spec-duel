---
name: cr-review
description: Read-only review of a diff against the cyberrock risk catalogue and the rule gates, with a concrete failing case for every finding. Use for "cr review", "review this change", a commit, a range or uncommitted work.
argument-hint: "[commit, range or files]"
---

# cr-review

Start the `cr-reviewer` agent once and relay its findings unchanged.

Give it:

- what to review: the range or files from the arguments; with none, the uncommitted diff, or the last commit when the tree is clean;
- the change file, when the diff belongs to one (`cr/changes/<id>/change.md` or `cr/changes/archive/<id>/change.md`).

Do not edit anything. Fixing is `cr-apply`'s job.
