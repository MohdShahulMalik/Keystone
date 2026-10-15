# Anonymous apply workflow (Keystone supplies jobs, agent never sees PII)

Keystone is the bulk source. The agent reads the queue on localhost, opens the
real apply link in headless Chrome via chrome-devtools MCP, and plans fills
with `{{tokens}}`. Raw values are resolved locally by you, never in agent context.

## Data flow

```
Keystone Postgres -> GET localhost:5421/api/apply/queue (agent, safe: no PII)
Agent snapshot (chrome-devtools MCP) -> writes scripts/apply/plans/<jobId>.json with {{tokens}} only
You: bun scripts/apply/interpolate.ts --template plans/<jobId>.json --out /tmp/opencode/resolved-<jobId>.json
You: fill in headless Chrome from resolved file, screenshot to fixes/apply/<jobId>/, review
You: submit in browser, then agent POSTs localhost:5421/api/apply/mark-applied {"id"}
```

The agent only ever sees token names (`contact.email`) and field labels.
Screenshots of filled forms stay in `fixes/apply/<jobId>/` for human eyes —
do not attach them to agent context or they leak PII to the provider.

## One-time setup

1. Fill your vault (outside the repo, mode 600):
   `cp scripts/apply/profile.example.json ~/.config/keystone/profile.json`
   Edit `~/.config/keystone/profile.json` with real values. Never commit it.
2. Start Keystone: `bun run dev` (serves `http://localhost:5421`)
3. Chrome headless only (per responsive-fixes skill). Check without launching:
   `command -v google-chrome` (yours: `/home/maxum/.local/bin/google-chrome`)
   Serve with remote debugging for the MCP:
   `google-chrome --headless=new --disable-gpu --remote-debugging-port=9222 --user-data-dir=/tmp/opencode-chrome-profile http://localhost:5421/listings`
4. Add chrome-devtools MCP to your OpenCode project config (`opencode.json` in
   keystone root, bun form):
   `{ "mcp": { "chrome-devtools": { "type": "local", "command": ["bunx", "-y", "chrome-devtools-mcp@latest", "--browser-url=http://127.0.0.1:9222"] } } }`
   Keep `~/.config/opencode/opencode.jsonc` untouched (provider keys live there).

## Per-job loop (opencode prompt)

> Pull `GET http://localhost:5421/api/apply/queue?status=OPEN&limit=20`. Pick
> one job with a non-null `url`. Snapshot the apply page with chrome-devtools
> MCP, write `scripts/apply/plans/<jobId>.json` using tokens from
> `scripts/apply/profile.example.json` keys (e.g. `{{contact.email}}`), never
> real values. Run `bun scripts/apply/interpolate.ts --list-tokens --template
> scripts/apply/plans/<jobId>.json` to confirm names. STOP. Report the company,
> role, and which tokens are needed. Do not fill, do not submit, do not read
> `~/.config/keystone/profile.json`, do not read `fixes/apply/`.

Human then runs:
`bun scripts/apply/interpolate.ts --template scripts/apply/plans/<jobId>.json --out /tmp/opencode/resolved-<jobId>.json`
Fill from that file in headless Chrome, save before/after screenshots to
`fixes/apply/<jobId>/`, review, submit in browser, then tell the agent to run:
`curl -X POST http://localhost:5421/api/apply/mark-applied -H 'Content-Type: application/json' -d '{"id":"<jobId>"}'`

## Rules

- Agent must not `read` `~/.config/keystone/profile.json`, `/tmp/opencode/resolved-*.json`, or `fixes/apply/` screenshots.
- `interpolate.ts` has no network code and never prints values; `--list-tokens` prints names only.
- Review-before-submit always. Never auto-bypass CAPTCHA/login walls.
- Status truth is the queue API + `/listings` UI (`updateStatus` server action).
