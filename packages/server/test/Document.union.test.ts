import type * as Document from "@confect/server/Document";
import type * as TableInfo from "@confect/server/TableInfo";
import { describe, expect, it } from "@effect/vitest";
import unnamedEvents from "./mock-backend/fixtures/confect/tables/events";

// Regression test for union-schema table documents. The `events` fixture is a
// `Schema.Union` of two structs that share `kind` but each carry a
// branch-specific field (`a` / `b`). When the document type collapses to
// `Sys & (A | B)`, `WithoutSystemFields`/`Partial` keep only the fields common
// to every branch (`kind`), so patching a branch-specific field is rejected
// with TS2353. The composition must distribute the system fields —
// `(Sys & A) | (Sys & B)` — so each branch keeps its own fields.
describe("union-schema documents", () => {
  it("WithoutSystemFields preserves branch-specific fields", () => {
    const events = unnamedEvents("events");
    type Doc = TableInfo.TableInfo<typeof events>["document"];
    type PatchArg = Partial<Document.WithoutSystemFields<Doc>>;

    // Object-literal assignments mirror a `db.patch(id, { … })` call site:
    // before the fix these branch-specific fields were excess properties.
    const branchAPatch: PatchArg = { a: "x" };
    const branchBPatch: PatchArg = { b: 1 };
    // The discriminant common to both branches stays patchable too.
    const commonPatch: PatchArg = { kind: "a" };

    expect([branchAPatch, branchBPatch, commonPatch]).toHaveLength(3);
  });
});
