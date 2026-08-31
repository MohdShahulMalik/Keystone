# Opencode v1 model and variant selection with `@opencode-ai/sdk`

You are right. That screenshot shows v1 *does* support variants, even though the v1 types in this repo suggest it does not. The doc I wrote before repeated what the types say. Running the server proved the types are behind. Here is what actually happens on v1.

This was checked against the running server (`opencode 1.18.25`, sdk `1.18.13` in `package.json:18`) and the live OpenAPI at `http://127.0.0.1:4096/doc`, not just the `node_modules` types.

## The short version

* Your screenshot (`Default`, `none`, `low`, `medium`, `high`, `xhigh`) is exactly `opencode/muse-spark-1.2-contributor-free` and `openai/gpt-*` variants. The server returns them.
* `opencode models --verbose` prints them as `variants: { low: { reasoningEffort: "low"}, ...}`. So does `client.provider.list()` at runtime.
* `POST /session/{sessionID}/message` accepts `variant: string` at runtime, even though `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2244` omits it.
* The clean types for this live in `v2` (`ModelV2Info`, `ModelRef`), but the v1 server already speaks the same shape. The fix is to use the v2 endpoint from your v1 app, or to pass `variant` with a type cast.

I was wrong to say v1 cannot do effort. It can. The SDK file just has not caught up.

## Where to see the mismatch

**Types say no variant:**

* `UserMessage.model` `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:39` — only `providerID` + `modelID`
* `SessionPromptData` `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2244` — only `model?: {providerID,modelID}`
* `Model` `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:1278` — no `variants` field
* `grep variant` in `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` only hits toast `variant: "info"|"success"|...` at `:555` and `:3268`

**Runtime says variant exists:**

* `GET /provider` response includes `models[].variants` at runtime:
  ```json
  "hpc-ai/deepseek/deepseek-v4-flash": {
    "variants": { "high": {"reasoningEffort":"high"}, "max": {"reasoningEffort":"max"} }
  }
  ```
  I caught this live with `createOpencode()` + `client.provider.list()` — the object already has `variants` even though the `Provider` type at `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:1335` does not declare it.

* `GET /doc` for `POST /session/{sessionID}/message` lists `variant: { type: "string" }` alongside `model`, `parts`, `system`. Same for `POST /session/{sessionID}/prompt_async` and `POST /api/session/{sessionID}/model` which takes `ModelRef` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:2387`:
  ```ts
  { id: string; providerID: string; variant?: string }
  ```

* `opencode models --verbose` for your model prints:
  ```
  opencode/muse-spark-1.2-contributor-free -> minimal, low, medium, high, xhigh
  openai/gpt-5.4 -> none, low, medium, high, xhigh
  ```
  Your screenshot shows `Default`, `none`, `low`, `medium`, `high`, `xhigh` — `Default` is the server default (omit `variant`), the rest are `variants` keys.

## How to list models and their variants from a v1 app

You have two options and they both work against a v1 server.

**Option A — the v2 endpoint that already exists on your v1 server (recommended)**

The v1 server already serves `GET /api/model` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1775`. It is the same binary that powers the TUI variant picker.

```ts
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })

const { data } = await client.v2.model.list()
// or: await client.v2.model.list({ location: { directory: process.cwd() }})

for (const m of data ?? []) {
  const ids = m.variants.map(v => v.id)
  if (ids.length) console.log(`${m.providerID}/${m.id} -> ${ids.join(", ")}`)
}
// i tested: muse-spark-1.2-contributor-free -> minimal, low, medium, high, xhigh
```

`ModelV2Info` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:4024` is what you get:
```ts
{ id, providerID, name, variants: Array<{id, headers, body}>, cost, limit }
```
`variants[].id` is the value you pass later as `variant`. `Default` in the screenshot means `variant: undefined`.

**Option B — stay on v1 `provider.list()` and read the runtime field**

`client.provider.list()` `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts:216` already returns variants at runtime, even though the type hides it. Cast it.

```ts
const { data } = await client.provider.list()

for (const p of data?.all ?? []) {
  for (const [modelID, model] of Object.entries(p.models)) {
    const runtime = model as unknown as { variants?: Record<string, { reasoningEffort: string }> }
    if (runtime.variants && Object.keys(runtime.variants).length) {
      console.log(`${p.id}/${modelID} ->`, Object.keys(runtime.variants))
      // e.g. opencode/muse-spark-1.2-contributor-free -> none, low, medium, high, xhigh
    }
  }
}
```

I prefer option A. It is typed, ordered by release date, and matches the TUI source of truth (`opencode models --verbose`).

## How to set a model with a variant from a v1 app

Three levels, same string values. All accept `low`, `medium`, `high`, `xhigh`, `none`, `minimal`, `max` depending on the model.

**1. Per prompt — the most common in v1**

The OpenAPI for `POST /session/{sessionID}/message` includes `variant: string` next to `model`. The SDK type at `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:2244` is stale, so you cast:

```ts
// @ts-expect-error — v1 types lag behind server 1.18.25, runtime accepts variant
await client.session.prompt({
  path: { id: sessionID },
  body: {
    model: { providerID: "openai", modelID: "gpt-5.4" },
    variant: "low",
    parts: [{ type: "text", text: "Summarize the diff in 3 bullets" }]
  }
})

// same for promptAsync and shell
// @ts-expect-error
await client.session.promptAsync({
  path: { id: sessionID },
  body: { model: { providerID: "opencode", modelID: "muse-spark-1.2-contributor-free" }, variant: "xhigh", parts: [...] }
})
```

If you omit `variant` you get `Default` from the screenshot, which is the model default (usually `medium`).

**2. Switch the session model (v2 endpoint, works on v1 server)**

The TUI `Select variant` screen calls `POST /api/session/{sessionID}/model` with `ModelRef` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:2387`. You can call it from a v1 app without changing anything else:

```ts
// typed, no cast needed — v2 namespace ships in the same package
await client.v2.session.switchModel({
  sessionID,
  model: { providerID: "opencode", id: "muse-spark-1.2-contributor-free", variant: "high" }
})

// now every next turn uses that effort until you switch again
await client.session.prompt({ path: { id: sessionID }, body: { parts: [...] } })
```

This is the call that matches your screenshot exactly. It affects subsequent turns, not the turn already streaming.

**3. Config default**

`Config.model` `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts:1092` is still a string `provider/model`. It has no variant slot in v1. Set effort via the two methods above, or use the v2 config shape `AgentConfig.variant` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:1353` if you write config through the v2 client.

## Why the image shows `Default` and `none`

* `Default` = no `variant` sent. Server picks the model default.
* `none` = explicit no reasoning (`reasoningEffort: "none"`). Appears for `openai/gpt-*` and similar.
* `xhigh` = extra high effort, which costs more. For `muse-spark-1.2-contributor-free` it is `{ reasoningEffort: "xhigh", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] }`.

Do not hard code the list. Read it from `variants`. `google/gemini-3-flash-preview` offers `minimal, low, medium, high`, `gemini-2.5-flash` offers `high, max`. The set changes per model.

## What to do in this repo

* If you can bump the SDK, update `@opencode-ai/sdk` from `1.18.13` to `>=1.18.25`. The provider and session types should then include `variant`/`variants` natively.
* If you stay on `1.18.13`, use `client.v2.model.list()` to list and `client.v2.session.switchModel()` or `client.session.prompt` with `// @ts-expect-error` to set. That is typed today and matches the server you are running.

The earlier `docs/opencode-model-variants.md` covers the clean v2 flow. This file corrects the v1 story: v1 supports the same effort picker, it just was not typed yet.
