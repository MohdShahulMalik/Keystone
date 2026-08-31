# Opencode model and variant selection with `@opencode-ai/sdk`

This note records how `@opencode-ai/sdk@1.18.13` (declared in `package.json:18`) exposes models and reasoning-effort variants, and how to pick a specific combination. I checked the installed types directly, so file references below point to what is on disk, not docs that may drift.

## What I found, quickly

The clean `variant` you pass as `low`, `medium`, `high`, `xhigh` is typed only in the v2 namespace. The v1 SDK types in this repo (`1.18.13`) suggest it does not exist, but the running server (`1.18.25`) already supports it. See `docs/opencode-v1-model-variants.md` for the v1 correction and the live OpenAPI proof.

`ModelV2Info.variants` is still the source of truth. If a model has no entry there, the field does nothing.

I prefer the v2 path for everything, even from a v1 app — the v1 server already serves `GET /api/model` and `POST /api/session/{id}/model`. The v1 `Config.providers` and `ProviderConfig` variants exist as static config (`node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:1453`), but they do not let you list what the server actually supports at runtime.

## Where the types live

* `ModelRef` is the shape you pass around: `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:2387`
  ```ts
  export type ModelRef = { id: string; providerID: string; variant?: string }
  ```
* `ModelV2Info` is what the server returns: `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:4024`
  ```ts
  export type ModelV2Info = {
    id: string
    providerID: string
    name: string
    variants: Array<{ id: string; headers: Record<string,string>; body: Record<string,unknown> }>
    request: { headers: {}; body: {}; variant?: string }
    cost: Array<ModelCost>
    limit: { context: number; output: number }
    status: "alpha" | "beta" | "deprecated" | "active"
  }
  ```
  `variants[].id` is the value you should pass as `variant`. For reasoning models it is usually `low`, `medium`, or `high`. For a plain chat model the array is empty.

* Session, messages, and agents all reuse the same fields:
  * `Session.model` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:93`
  * `UserMessage.model` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:142`
  * `AgentConfig.variant` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:1353`

## How to list models and their variants

Use `client.v2.model.list()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1775`. It returns models ordered by release date, and it already includes the variant list.

```ts
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })

const { data, error } = await client.v2.model.list()
// Scoped to a project directory if you need it:
// await client.v2.model.list({ location: { directory: "/home/maxum/projects/personal/javascript/keystone" }})

if (error) throw error

for (const m of data ?? []) {
  const effortOptions = m.variants.map(v => v.id).join(", ") || "(no variants)"
  console.log(`${m.providerID}/${m.id} — ${m.name} — ${effortOptions}`)
}

// Only models that support reasoning effort
const reasoningModels = (data ?? []).filter(m => m.variants.length > 0)

// Look up one model
const gpt5 = (data ?? []).find(m => m.providerID === "openai" && m.id === "gpt-5")
console.log(gpt5?.variants.map(v => v.id)) // ["low","medium","high"] when available
```

I keep this result and build the picker from it. There is no separate `listVariants` call. `ModelV2Info.variants` is the list.

If you want the provider view instead, `client.v2.provider.list()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1788` gives you providers, but it does not tell you which effort levels a model supports. Stick with `model.list()`.

## How to select a model with a variant

You always pass a `ModelRef`. The `variant` is optional. Omit it and the provider uses its default, which is usually `medium`.

### Create a session with an effort level

`client.v2.session.create()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1647` and the older `client.session.create()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:972` accept the same shape.

```ts
await client.v2.session.create({
  model: { providerID: "openai", id: "gpt-5", variant: "high" }
})

await client.v2.session.create({
  model: { providerID: "anthropic", id: "claude-sonnet-4-20250514", variant: "low" }
})
```

### Switch effort on an existing session

This is the call I use most. `client.v2.session.switchModel()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1676`:

```ts
await client.v2.session.switchModel({
  sessionID: "ses_123",
  model: { providerID: "openai", id: "gpt-5", variant: "medium" }
})
```

It affects the next turns, not turns already in flight.

### Override per prompt

`client.session.prompt()` `node_modules/@opencode-ai/sdk/dist/v2/gen/sdk.gen.d.ts:1085`, plus `promptAsync` `:1198` and `command` `:1222`, take `variant` alongside `model`.

```ts
await client.session.prompt({
  sessionID: "ses_123",
  model: { providerID: "openai", modelID: "gpt-5" },
  variant: "low",
  parts: [{ type: "text", text: "Explain the diff in 3 bullets" }]
})

// same for commands
await client.session.command({
  sessionID: "ses_123",
  command: "my-command",
  variant: "high"
})
```

For v2 sessions the durable prompt path goes through `switchModel` first, then `client.v2.session.prompt()`.

## Things that tripped me up

* Variant strings are not normalized. One provider may use `low`, another `effort-low` or `minimal`. Trust `ModelV2Info.variants[].id` instead of hard coding `low|medium|high`.
* A bad variant fails with `V2SessionSwitchModelErrors`. The types do not validate it client side.
* Non-reasoning models silently ignore `variant`. Check `variants.length` before showing the picker, otherwise you offer a control that does nothing.
* Global defaults live in `Config.model`, `Config.small_model`, and `Config.provider[providerID].models[modelID].variants` `node_modules/@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:1517`, but they are file config. For runtime UI, `model.list()` is the source of truth.

## Minimal end to end example

```ts
import { createOpencodeClient } from "@opencode-ai/sdk"

const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:4096" })

// 1. get options
const { data: models } = await client.v2.model.list()
const target = models?.find(m => m.providerID === "openai" && m.id === "gpt-5")
if (!target) throw new Error("model not found")
const availableEfforts = target.variants.map(v => v.id) // ["low","medium","high"]
const pickedEffort = availableEfforts.includes("low") ? "low" : undefined

// 2. create session with it
const { data: session } = await client.v2.session.create({
  model: { providerID: target.providerID, id: target.id, variant: pickedEffort }
})

// 3. change later
await client.v2.session.switchModel({
  sessionID: session!.id,
  model: { providerID: target.providerID, id: target.id, variant: "high" }
})
```

That is the full loop. List once, store `variants[].id`, pass the chosen id as `ModelRef.variant` wherever the SDK asks for a model.
