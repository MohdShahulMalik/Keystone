// Local-only token resolver. No network calls. Never prints raw values.
// Agent sees tokens like {{contact.email}}; this script resolves them from
// ~/.config/keystone/profile.json into a 600-mode file the filler reads.
//
// Usage (bun only):
//   bun scripts/apply/interpolate.ts --list-tokens --template plan.json
//     -> prints token NAMES only (safe to show the agent)
//   bun scripts/apply/interpolate.ts --template plan.json --out /tmp/opencode/resolved.json
//     -> writes resolved values, prints counts only (human runs this)
//
// plan.json shape:
//   { "fields": [{ "uid": "chrome-field-id", "token": "{{contact.email}}", "label": "Email" }] }

export {};

const DEFAULT_PROFILE = `${process.env.HOME ?? "/home/maxum"}/.config/keystone/profile.json`;

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out as {
    profile?: string;
    template?: string;
    out?: string;
    "list-tokens"?: boolean;
    help?: boolean;
  };
}

function getByPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[k]
          : undefined,
      obj,
    );
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function tokensIn(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) found.add(m[1]);
  return [...found];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.template) {
    console.log(
      "Usage: bun scripts/apply/interpolate.ts --template plan.json [--profile ~/.config/keystone/profile.json] [--list-tokens | --out resolved.json]",
    );
    process.exit(args.help ? 0 : 1);
  }
  const profilePath = args.profile ?? DEFAULT_PROFILE;
  const templateRaw = await Bun.file(args.template).text();
  const needed = tokensIn(templateRaw);

  if (args["list-tokens"]) {
    // Names only — safe for agent context.
    console.log(JSON.stringify({ tokens: needed.sort() }, null, 2));
    return;
  }

  if (!args.out) {
    console.error("Refusing to print values. Pass --out <path> (human only).");
    process.exit(1);
  }

  const profile = JSON.parse(await Bun.file(profilePath).text());
  const missing: string[] = [];
  const resolved = templateRaw.replace(TOKEN_RE, (_, path: string) => {
    const v = getByPath(profile, path);
    if (typeof v !== "string" || v === "" || v === "FILL_ME") {
      missing.push(path);
      return `{{${path}}}`;
    }
    return v;
  });

  if (missing.length > 0) {
    // Names only — never values.
    console.error(
      `Missing ${missing.length} token(s) in profile (fill ~/.config/keystone/profile.json): ${[...new Set(missing)].sort().join(", ")}`,
    );
    process.exit(2);
  }

  await Bun.write(args.out, resolved);
  await Bun.$`chmod 600 ${args.out}`.quiet();
  console.log(
    `Resolved ${needed.length} token type(s) for ${(JSON.parse(templateRaw).fields ?? []).length} field(s). Values written to ${args.out} (mode 600), not shown here.`,
  );
}

await main();
