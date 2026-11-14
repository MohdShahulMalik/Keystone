// Intent: lib/opencode/server.ts wraps the local opencode server — model
// discovery (v2 list merged with provider variants, google filtered out,
// fallback ref on any failure), session create with cold-boot retries, prompt
// send with optional variant switch, and best-effort session delete.
import { beforeEach, describe, expect, mock, test } from "bun:test";

declare global {
  // eslint-disable-next-line no-var
  var __mockV1Client: unknown;
  // eslint-disable-next-line no-var
  var __mockV2Client: unknown;
  // eslint-disable-next-line no-var
  var __mockIsV2: boolean | undefined;
}

mock.module("@/lib/opencode/client", () => ({
  getOpencodeClient: mock(async () => globalThis.__mockV1Client),
  getOpencodeClientV2: mock(async () => globalThis.__mockV2Client),
  getOpencodeServer: mock(async () => ({ url: "http://127.0.0.1:3211" })),
  isOpencodeServerV2: mock(async () => globalThis.__mockIsV2 ?? false),
  authHeaders: mock(() => ({ authorization: "Basic test" })),
}));

const server = await import("@/lib/opencode/server");

const FREE_FALLBACK = {
  id: "glm-5.3-flash-free",
  providerID: "opencode",
};

function setV2ModelList(models: unknown[]) {
  globalThis.__mockV2Client = {
    v2: { model: { list: mock(async () => ({ data: { data: models } })) } },
  };
}
function setProviderList(all: unknown[]) {
  globalThis.__mockV1Client = {
    provider: { list: mock(async () => ({ data: { all } })) },
    session: {},
    event: {},
  };
}

beforeEach(() => {
  globalThis.__mockIsV2 = false;
  setV2ModelList([]);
  setProviderList([]);
});

describe("listAvailableModels", () => {
  test("merges provider variants into v2 models", async () => {
    setV2ModelList([
      {
        id: "m",
        providerID: "opencode",
        name: "M",
        variants: [],
        status: "active",
      },
    ]);
    setProviderList([
      {
        id: "opencode",
        models: { m: { variants: { high: { maxTokens: 1 } } } },
      },
    ]);
    const models = await server.listAvailableModels();
    expect(models.length).toBe(1);
    expect(models[0].variants.length).toBe(1);
    expect(models[0].variants[0].id).toBe("high");
  });

  test("filters out every google provider model", async () => {
    setV2ModelList([
      {
        id: "g",
        providerID: "google",
        name: "G",
        variants: [],
        status: "active",
      },
      {
        id: "m",
        providerID: "opencode",
        name: "M",
        variants: [],
        status: "active",
      },
    ]);
    const models = await server.listAvailableModels();
    expect(models.every((m) => m.providerID !== "google")).toBe(true);
    expect(models.length).toBe(1);
  });

  test("falls back to the free ref when v2 returns nothing", async () => {
    setV2ModelList([]);
    const models = await server.listAvailableModels();
    expect(models).toEqual([
      expect.objectContaining({
        id: FREE_FALLBACK.id,
        providerID: FREE_FALLBACK.providerID,
      }),
    ]);
    // Fallback info must expose the variants so the picker defaults to
    // "high" and offers low/max, even when discovery fails.
    expect(models[0].variants.map((v) => v.id)).toEqual(["low", "high", "max"]);
  });

  test("falls back when provider.list throws and v2 is empty", async () => {
    globalThis.__mockV1Client = {
      provider: {
        list: mock(async () => {
          throw new Error("server down");
        }),
      },
    };
    setV2ModelList([]);
    const models = await server.listAvailableModels();
    expect(models[0].id).toBe(FREE_FALLBACK.id);
  });
});

describe("createResearchSession", () => {
  const envelopeCreate = (create: unknown) => ({
    v2: { session: { create } },
  });

  test("uses v2 create with the requested model when provided", async () => {
    globalThis.__mockIsV2 = true;
    const create = mock(async () => ({ data: { id: "sess-v2" } }));
    globalThis.__mockV2Client = envelopeCreate(create);
    const session = await server.createResearchSession({
      providerID: "opencode",
      id: "m",
    });
    expect(session?.id).toBe("sess-v2");
    expect(create).toHaveBeenCalled();
  });

  test("unwraps the server 2.x {data:{id}} create envelope", async () => {
    globalThis.__mockIsV2 = true;
    const create = mock(async () => ({
      data: { data: { id: "sess-2x-wrap" } },
    }));
    globalThis.__mockV2Client = envelopeCreate(create);
    const session = await server.createResearchSession({
      providerID: "opencode",
      id: "m",
    });
    expect(session?.id).toBe("sess-2x-wrap");
  });

  test("retries v2 once then falls back to v1", async () => {
    globalThis.__mockIsV2 = true;
    let v2calls = 0;
    globalThis.__mockV2Client = {
      v2: {
        session: {
          create: mock(async () => {
            v2calls += 1;
            throw new Error("cold");
          }),
        },
      },
    };
    const v1create = mock(async () => ({ data: { id: "sess-v1" } }));
    globalThis.__mockV1Client = { session: { create: v1create } };
    const session = await server.createResearchSession({
      providerID: "opencode",
      id: "m",
    });
    expect(v2calls).toBe(2);
    expect(session?.id).toBe("sess-v1");
  });

  test("throws a wrapped error after v1 retries are exhausted", async () => {
    globalThis.__mockV1Client = {
      session: {
        create: mock(async () => {
          throw new Error("refused");
        }),
      },
    };
    await expect(server.createResearchSession()).rejects.toThrow(
      "Failed to create OpenCode session",
    );
  }, 10000);

  test("throws on empty session responses", async () => {
    globalThis.__mockV1Client = {
      session: { create: mock(async () => ({ data: undefined })) },
    };
    await expect(server.createResearchSession()).rejects.toThrow(
      "Failed to create OpenCode session",
    );
  }, 10000);
});

describe("sendResearchPrompt / deleteResearchSession", () => {
  test("sends system prompt + text part with model mapping", async () => {
    const prompt = mock(async () => ({ data: { ok: true } }));
    globalThis.__mockV1Client = { session: { prompt } };
    await server.sendResearchPrompt(
      "sess-1",
      "find Rust jobs",
      { providerID: "opencode", id: "m" },
      "SYSTEM",
    );
    const arg = (
      prompt.mock.calls[0] as unknown as Array<{
        path: { id: string };
        body: {
          system: string;
          model: { providerID: string; modelID: string };
        };
      }>
    )[0];
    expect(arg.path.id).toBe("sess-1");
    expect(arg.body.system).toBe("SYSTEM");
    expect(arg.body.model).toEqual({ providerID: "opencode", modelID: "m" });
  });

  test("v2 admission endpoint is used on 2.x servers (system rides as text)", async () => {
    globalThis.__mockIsV2 = true;
    const calls: Array<{ url: string; body?: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/prompt")) {
        calls.push({
          url,
          body: typeof init?.body === "string" ? init.body : undefined,
        });
        return new Response(JSON.stringify({ data: { admittedSeq: 1 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      await server.sendResearchPrompt(
        "sess-1",
        "find Rust jobs",
        undefined,
        "SYSTEM",
      );
      expect(calls.length).toBe(1);
      expect(calls[0].url).toContain("/api/session/sess-1/prompt");
      expect(calls[0].body).toContain("SYSTEM");
      expect(calls[0].body).toContain("find Rust jobs");
      // flat body: { text } only — no nested prompt key
      const sent = JSON.parse(calls[0].body ?? "{}") as Record<string, unknown>;
      expect(typeof sent.text).toBe("string");
      expect(sent.prompt).toBeUndefined();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws when the v2 prompt endpoint rejects (non-2xx message surfaces)", async () => {
    globalThis.__mockIsV2 = true;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/prompt")) {
        return new Response(
          JSON.stringify({ message: "SessionNotFoundError" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return originalFetch(input);
    }) as typeof fetch;
    try {
      await expect(server.sendResearchPrompt("sess-1", "q")).rejects.toThrow(
        "SessionNotFoundError",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("throws when the v1 prompt endpoint rejects (non-2xx is not an exception)", async () => {
    globalThis.__mockIsV2 = false;
    const prompt = mock(async () => ({ error: { message: "bad request" } }));
    globalThis.__mockV1Client = { session: { prompt } };
    await expect(server.sendResearchPrompt("sess-1", "q")).rejects.toThrow(
      "bad request",
    );
  });

  test("subscribeToEvents normalizes the v2 {data} envelope to {properties}", async () => {
    globalThis.__mockIsV2 = true;
    async function* fakeStream() {
      yield { id: "1", type: "session.idle", data: { sessionID: "s1" } };
      yield {
        id: "2",
        type: "message.part.updated",
        data: { sessionID: "s1", part: { type: "text" }, delta: "x" },
      };
    }
    globalThis.__mockV2Client = {
      v2: { event: { subscribe: async () => ({ stream: fakeStream() }) } },
    };
    const stream = (await server.subscribeToEvents()) as AsyncIterable<{
      type: string;
      properties?: Record<string, unknown>;
    }>;
    const events = [];
    for await (const e of stream) events.push(e);
    expect(events[0]).toMatchObject({
      type: "session.idle",
      properties: { sessionID: "s1" },
    });
    expect(events[1].properties).toEqual({
      sessionID: "s1",
      part: { type: "text" },
      delta: "x",
    });
  });

  test("subscribeToEvents passes v1 events through unchanged", async () => {
    globalThis.__mockIsV2 = false;
    async function* fakeStream() {
      yield { type: "session.idle", properties: { sessionID: "s2" } };
    }
    globalThis.__mockV1Client = {
      event: { subscribe: async () => ({ stream: fakeStream() }) },
    };
    const stream = (await server.subscribeToEvents()) as AsyncIterable<{
      type: string;
      properties?: Record<string, unknown>;
    }>;
    const events = [];
    for await (const e of stream) events.push(e);
    expect(events[0]).toEqual({
      type: "session.idle",
      properties: { sessionID: "s2" },
    });
  });

  test("switches model first when a variant is requested", async () => {
    const switchModel = mock(async () => ({}));
    globalThis.__mockV2Client = { v2: { session: { switchModel } } };
    const prompt = mock(async () => ({ data: {} }));
    globalThis.__mockV1Client = { session: { prompt } };
    await server.sendResearchPrompt("sess-1", "q", {
      providerID: "opencode",
      id: "m",
      variant: "high",
    });
    expect(switchModel).toHaveBeenCalled();
  });

  test("deleteResearchSession never throws (orphan cleanup is best-effort)", async () => {
    globalThis.__mockV1Client = {
      session: {
        delete: mock(async () => {
          throw new Error("gone");
        }),
      },
    };
    await expect(
      server.deleteResearchSession("sess-x"),
    ).resolves.toBeUndefined();
  });
});
