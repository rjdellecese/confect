import type { PatchValue } from "@confect/server/DatabaseWriter";
import { expectTypeOf, it } from "@effect/vitest";

it("omits system fields from full document patch values", () => {
  type Doc = {
    readonly _id: string;
    readonly _creationTime: number;
    readonly text: string;
    readonly label?: string;
  };

  expectTypeOf<PatchValue<Doc>>().toEqualTypeOf<{
    readonly text?: string;
    readonly label?: string | undefined;
  }>();
  expectTypeOf<keyof PatchValue<Doc>>().toEqualTypeOf<"text" | "label">();
});

it("preserves patch semantics for documents without system fields", () => {
  type Fields = {
    text: string;
    label?: string;
    nested: { _id: string; _creationTime: number };
  };

  expectTypeOf<PatchValue<Fields>>().toEqualTypeOf<{
    text?: string;
    label?: string | undefined;
    nested?: { _id: string; _creationTime: number };
  }>();
});

it("preserves union members when omitting system fields", () => {
  type Doc = { _id: string; _creationTime: number } & (
    | { kind: "text"; text: string }
    | { kind: "image"; url: string; caption?: string }
  );

  expectTypeOf<PatchValue<Doc>>().toEqualTypeOf<
    | { kind?: "text"; text?: string }
    | { kind?: "image"; url?: string; caption?: string | undefined }
  >();
});
