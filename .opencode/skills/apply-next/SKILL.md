---
name: Apply Next
description: Run one anonymous Keystone job-application prep loop from localhost queue to token plan, then stop for human review
---

Run one per-job prep loop. Keystone supplies bulk listings; you only prepare a
token plan. You never see, fill, or submit personal data.

Run from the keystone repo root. Use `bun`, never `npm`/`npx`.
Headless Chrome only — never launch headed browsers.

## Loop

1. Read `docs/APPLY_WORKFLOW.md` and `scripts/apply/profile.example.json`
   for the token keys (e.g. `{{contact.email}}`).
2. Pull the queue: `GET http://localhost:5421/api/apply/queue?status=OPEN&limit=20`
   (Keystone dev server must be running: `bun run dev`).
   Pick the first job with a non-null `url`. If none, report and stop.
3. Snapshot the apply `url` with the chrome-devtools MCP
   (expects remote debugging at `http://127.0.0.1:9222`).
   Map each fillable field to its token from the example profile keys.
4. Write `scripts/apply/plans/<jobId>.json` (tokens only, never real values):
   `{ "jobId": "...", "jobUrl": "...", "fields": [{ "uid": "<snapshot-field-id>", "token": "{{contact.email}}", "label": "Email" }] }`
   See `scripts/apply/plan.example.json` for the exact shape.
5. Verify names only:
   `bun scripts/apply/interpolate.ts --list-tokens --template scripts/apply/plans/<jobId>.json`
6. STOP. Report company, role, apply URL, and tokens needed.
   Do not resolve, fill, screenshot filled forms, or submit.

## Never

- `read` `~/.config/keystone/profile.json`, `/tmp/opencode/resolved-*.json`,
  `fixes/apply/` screenshots, or any `.env` file.
- Print, type, or attach resolved values. `--list-tokens` prints names only;
  `--out` resolution is human-only.
- Auto-submit or bypass CAPTCHA / login walls.
- Mark applied yourself — the human submits in the browser, then asks for
  `POST http://localhost:5421/api/apply/mark-applied` with `{"id":"<jobId>"}`.
