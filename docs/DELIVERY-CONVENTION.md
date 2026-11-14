# Delivery convention

For every subsequent implementation increment, provide:

1. Complete cumulative source project including migrations and dependency lockfile; do not deliver only snippets or undocumented patches.
2. Feature implementation documentation inside `docs`, stating implemented behavior, permission effects, tests, limitations and next work.
3. `COMMIT_MESSAGE.txt` containing a ready-to-use GitHub commit message for the current release.
4. Complete run/build/migration steps, including Windows PowerShell instructions and upgrade notes where data/schema changes occur.
5. Release notes and test report with actual outcomes and explicit verification gaps.

Version releases incrementally. Preserve user data and migration history. Never present planned modules as completed. Deliver files for self-hosting; do not publish or push to a repository unless requested.
