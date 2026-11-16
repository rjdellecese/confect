import { expect, test } from "bun:test";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import {
  checkScope,
  isEvidencePath,
  Manifest,
  validateManifest,
} from "../tools/api-docs/validate";

const source = "packages/core/src/Table.ts";
const doc = "apps/docs/server/database/schema.mdx";
const manifest: Manifest = {
  modules: {
    "@confect/core/Table": {
      source,
      entries: [
        {
          symbols: ["Table.Doc"],
          reference: "included",
          audience: "application",
          evidence: [{ path: doc, contains: "Table.Doc" }],
        },
      ],
    },
  },
};
const sources = {
  [source]: "export interface Table { Doc: Schema }",
  [doc]: "Use Table.Doc",
};

test("validates dotted contracts without mutating inputs", () => {
  const json = Schema.fromJsonString(Schema.Unknown);
  const before = Schema.encodeResult(json)({ manifest, sources });
  expect(validateManifest(manifest, sources).pipe(Result.isSuccess)).toBe(true);
  expect(Schema.encodeResult(json)({ manifest, sources })).toEqual(before);
});

test.each([
  ["missing file", {}, "Missing source/evidence file"],
  [
    "stale quote",
    { ...sources, [doc]: "renamed" },
    "Evidence quote no longer resolves",
  ],
  [
    "stale symbol",
    { ...sources, [source]: "export interface Table {}" },
    "Missing source identifier: Doc",
  ],
] as const)("rejects %s", (_name, contents, reason) => {
  const result = validateManifest(manifest, contents);
  expect(result).toMatchObject({ _tag: "Failure" });
  if (Result.isFailure(result)) {
    expect(result.failure).toContainEqual(
      expect.objectContaining({
        _tag: "ScopeValidationError",
        reason: expect.stringContaining(reason),
      }),
    );
  }
});

test.each([
  ".env.local",
  "apps/example/.env.local",
  "apps/docs/../../.env.local",
  "node_modules/effect/src/Schema.ts",
  "/tmp/page.mdx",
])("rejects unsafe read path %s", (path) => {
  expect(isEvidencePath(path)).toBe(false);
});

test("rejects duplicate symbol decisions and mismatched package ownership", () => {
  const module = manifest.modules["@confect/core/Table"];
  expect(module).toBeDefined();
  if (module === undefined) return;
  const result = validateManifest(
    {
      modules: {
        "@confect/server/Table": {
          ...module,
          entries: [...module.entries, ...module.entries],
        },
      },
    },
    sources,
  );
  expect(result).toMatchObject({ _tag: "Failure" });
  if (Result.isFailure(result)) {
    expect(result.failure).toContainEqual(
      expect.objectContaining({ reason: "Duplicate symbol classification" }),
    );
    expect(result.failure).toContainEqual(
      expect.objectContaining({
        reason: "Package module key must match its public source owner",
      }),
    );
  }
});

test("validates public aliases separately from hidden definitions", () => {
  const owner = "packages/server/src/AiGatewayLanguageClient.ts";
  const implementation =
    "packages/server/src/internal/AiGatewayServiceToken.ts";
  const input: Manifest = {
    modules: {
      "@confect/server/AiGatewayLanguageClient": {
        source: owner,
        entries: [
          {
            symbols: ["AiGatewayDisabled"],
            source: implementation,
            reference: "included",
            audience: "application",
            evidence: [{ path: doc, contains: "AiGatewayDisabled" }],
          },
        ],
      },
    },
  };
  const files = {
    [owner]:
      'export { AiGatewayDisabled } from "./internal/AiGatewayServiceToken"',
    [implementation]: "export class AiGatewayDisabled {}",
    [doc]: "AiGatewayDisabled",
  };
  expect(validateManifest(input, files).pipe(Result.isSuccess)).toBe(true);
  const missingAlias = validateManifest(input, {
    ...files,
    [owner]: "export {}",
  });
  expect(missingAlias).toMatchObject({ _tag: "Failure" });
});

test.each([
  { modules: { bad: { source, entries: [] } } },
  { ...manifest, stripInternal: true },
  {
    modules: {
      bad: {
        source,
        entries: [
          {
            symbols: ["Table"],
            reference: "public",
            audience: "application",
            evidence: [],
          },
        ],
      },
    },
  },
])("rejects invalid metadata shapes", (input) => {
  expect(
    Schema.decodeUnknownResult(Manifest)(input, {
      onExcessProperty: "error",
    }).pipe(Result.isFailure),
  ).toBe(true);
});

test("validates the checked-in scope against repository evidence", () =>
  checkScope().pipe(Effect.provide(BunServices.layer), Effect.runPromise));
