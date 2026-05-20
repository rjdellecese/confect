import { describe, expect, it } from "@effect/vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fixtureRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "mock-backend/fixtures/confect/_generated/registeredFunctions/groups/notes.ts",
);

describe("import isolation", () => {
  it("group registry imports only its leaf impl", () => {
    const contents = readFileSync(fixtureRoot, "utf8");

    expect(contents).toContain("groups/notes.impl");
    expect(contents).not.toContain("groups/random.impl");
    expect(contents).not.toContain("impl.ts");
  });
});
