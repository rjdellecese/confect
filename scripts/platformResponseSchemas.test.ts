import { expect, test } from "bun:test";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { deployment } from "../packages/platform/src/internal/DeploymentResponses.js";

const logStream = deployment["get /get_log_stream/{id}"];
const s3 = {
  logStreamType: "s3Export",
  id: "mirror",
  status: { type: "active" },
  bucket: "exports",
  region: "us-east-1",
  accessKeyId: "example",
  prefix: null,
  period: "daily",
  selection: {
    _other: "included",
    "": {
      _other: "included",
      users: { _other: "included", email: "excluded" },
    },
    billing: "excluded",
  },
};

test("allOf retains fields from both objects and additionalProperties excludes declared keys", () => {
  const decoded = Schema.decodeResult(logStream)({
    ...s3,
    secretAccessKey: "write-only",
  });
  expect(decoded).toEqual(Result.succeed(s3));
});

test.each([
  { status: { type: "failed" } },
  { logStreamType: "webhook" },
  { period: null },
  { selection: { _other: "included", project: "included" } },
  { selection: { _other: "included", "": { _other: "included", users: {} } } },
  {
    selection: {
      _other: "included",
      "": { _other: "included", users: { _other: "all" } },
    },
  },
])("rejects malformed intersection or nested selection: %j", (overrides) => {
  const result = Schema.decodeResult(logStream)({ ...s3, ...overrides });
  expect(result._tag).toBe("Failure");
});

const sync = deployment["post /data/sync"];
const entry = {
  component: "",
  table: "messages",
  deleted: false,
  ts: 1_700_000_000_000_000_000,
  value: { _id: "a", tags: ["a", null], payload: { updated: true } },
};
const page = {
  syncId: "sync",
  pagination: { hasMore: true },
  status: { type: "stale", snapshotTs: entry.ts },
  truncates: [],
  values: [entry],
};

test("keeps open document fields and accepts integer timestamps beyond JavaScript’s safe integer range", () => {
  const decoded = Schema.decodeResult(sync)(page);
  expect(decoded).toEqual(Result.succeed(page));
});

test.each([
  { status: { type: "stale" } },
  { status: { type: "future", snapshotTs: 123 } },
  { values: [{ ...entry, ts: 1.5 }] },
  { values: [{ ...entry, value: [1, 2] }] },
  { pagination: { hasMore: "yes" } },
])("rejects malformed data sync pages: %j", (overrides) => {
  const result = Schema.decodeResult(sync)({ ...page, ...overrides });
  expect(result._tag).toBe("Failure");
});
