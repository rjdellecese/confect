import * as AotCompiler from "@confect/cli/AotCompiler";
import { SchemaCompilationError } from "@confect/cli/CodegenError";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Table from "@confect/core/Table";
import { afterEach, describe, expect, it } from "@effect/vitest";
import type { RegisteredQuery } from "convex/server";
import * as Effect from "effect/Effect";
import { identity } from "effect/Function";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
import * as SchemaGetter from "effect/SchemaGetter";
import * as SchemaAOTCompiler from "effect/unstable/schema/SchemaAOTCompiler";
import { vi } from "vitest";

vi.mock("effect/unstable/schema/SchemaAOTCompiler", { spy: true });

afterEach(() => vi.clearAllMocks());

describe("AotCompiler.table", () => {
  it("emits deterministic artifacts for Fields encoding and canonical Doc decoding", () => {
    const compile = vi.mocked(SchemaAOTCompiler.compile);
    const table = Table.make(() =>
      Schema.Struct({ amount: Schema.FiniteFromString }),
    )("notes");
    const first = Result.getOrThrowWith(
      AotCompiler.table("tables/notes.ts", table),
      identity,
    );

    expect(first.map(({ path }) => path)).toEqual([
      "tables/notes/fields.js",
      "tables/notes/fields.d.ts",
      "tables/notes/doc.js",
      "tables/notes/doc.d.ts",
    ]);
    expect(compile.mock.calls).toEqual([
      [[{ ast: SchemaAST.flip(table.Fields.ast), operations: ["decode"] }]],
      [[{ ast: table.Doc.ast, operations: ["decode"] }]],
    ]);
    expect(compile.mock.calls[1]?.[0][0]?.ast).toBe(table.Doc.ast);
    expect(first[0]?.contents).toContain(
      "effect/unstable/schema/SchemaCompiler/runtime",
    );
    expect(first[1]?.contents).toContain(
      "export declare function install(asts: ReadonlyArray<AST>): void;",
    );
    expect(
      Result.getOrThrowWith(
        AotCompiler.table("tables/notes.ts", table),
        identity,
      ),
    ).toEqual(first);
  });

  it("returns a tagged compilation error with the original failed thunk and module path", () => {
    const cause = { reason: "fields unavailable" };
    const table = Table.make(() => {
      throw cause;
    })("notes");
    const result = AotCompiler.table("tables/notes.ts", table);

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(SchemaCompilationError);
      expect(result.failure._tag).toBe("SchemaCompilationError");
      expect(result.failure.modulePath).toBe("tables/notes.ts");
      expect(result.failure.cause).toBe(cause);
    }
  });
});

describe("AotCompiler.group", () => {
  it("sorts function artifacts deterministically without reordering the group", () => {
    const group = GroupSpec.make()
      .addFunction(
        FunctionSpec.publicQuery({
          name: "zebra",
          returns: () => Schema.String,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "alpha",
          returns: () => Schema.Finite,
        }),
      );
    const first = Result.getOrThrowWith(
      AotCompiler.group("nested/notes.spec.ts", "nested/notes", group),
      identity,
    );

    expect(first.map(({ path }) => path)).toEqual([
      "groups/nested/notes/alpha.js",
      "groups/nested/notes/alpha.d.ts",
      "groups/nested/notes/zebra.js",
      "groups/nested/notes/zebra.d.ts",
      "groups/nested/notes.ts",
    ]);
    expect(first[4]?.contents).toContain('from "./notes/alpha.js"');
    expect(first[4]?.contents).toContain('from "./notes/zebra.js"');
    expect(first[4]?.contents).toContain(
      "export const prepare = (item: ConfectFunctionRegistryItem)",
    );
    expect(Object.keys(group.functions)).toEqual(["zebra", "alpha"]);
    expect(
      Result.getOrThrowWith(
        AotCompiler.group("nested/notes.spec.ts", "nested/notes", group),
        identity,
      ),
    ).toEqual(first);
    expect(Object.keys(group.functions)).toEqual(["zebra", "alpha"]);
  });

  it("requests args decoding and returns, function error, and middleware error encoding", () => {
    const compile = vi.mocked(SchemaAOTCompiler.compile);
    const functionError = Schema.Struct({ code: Schema.FiniteFromString });
    const groupError = Schema.Struct({ group: Schema.FiniteFromString });
    const middlewareError = Schema.Struct({
      middleware: Schema.FiniteFromString,
    });
    class GroupPolicy extends MiddlewareSpec.MiddlewareSpec<GroupPolicy>()(
      "GroupPolicy",
      {
        error: () => groupError,
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    class FunctionPolicy extends MiddlewareSpec.MiddlewareSpec<FunctionPolicy>()(
      "FunctionPolicy",
      {
        error: () => middlewareError,
        functionTypes: { query: true, mutation: false, action: false },
      },
    ) {}
    const fn = FunctionSpec.publicQuery({
      name: "get",
      args: () => ({ amount: Schema.FiniteFromString }),
      returns: () => Schema.FiniteFromString,
      error: () => functionError,
    }).middleware(FunctionPolicy);
    const group = GroupSpec.make().middleware(GroupPolicy).addFunction(fn);

    const artifacts = Result.getOrThrowWith(
      AotCompiler.group("notes.spec.ts", "notes", group),
      identity,
    );

    expect(compile.mock.calls).toEqual([
      [
        [
          { ast: fn.functionProvenance.args.ast, operations: ["decode"] },
          {
            ast: SchemaAST.flip(fn.functionProvenance.returns.ast),
            operations: ["decode"],
          },
          { ast: SchemaAST.flip(functionError.ast), operations: ["decode"] },
          { ast: SchemaAST.flip(groupError.ast), operations: ["decode"] },
          { ast: SchemaAST.flip(middlewareError.ast), operations: ["decode"] },
        ],
      ],
    ]);
    expect(artifacts[2]?.contents).toContain("errors.length !== 3");
  });

  it("compiles the composed pagination args and page result rather than just the item", () => {
    const compile = vi.mocked(SchemaAOTCompiler.compile);
    const fn = FunctionSpec.publicPaginatedQuery({
      name: "list",
      args: () => ({ author: Schema.String }),
      item: () => Schema.Struct({ amount: Schema.FiniteFromString }),
    });
    const result = AotCompiler.group(
      "notes.spec.ts",
      "notes",
      GroupSpec.make().addFunction(fn),
    );

    expect(Result.isSuccess(result)).toBe(true);
    expect(Object.keys(fn.functionProvenance.args.fields)).toEqual([
      "author",
      "paginationOpts",
    ]);
    expect(compile.mock.calls).toEqual([
      [
        [
          { ast: fn.functionProvenance.args.ast, operations: ["decode"] },
          {
            ast: SchemaAST.flip(fn.functionProvenance.returns.ast),
            operations: ["decode"],
          },
        ],
      ],
    ]);
    expect(
      Schema.encodeSync(fn.functionProvenance.returns)({
        page: [{ amount: 1 }],
        isDone: true,
        continueCursor: "done",
      }),
    ).toEqual({
      page: [{ amount: "1" }],
      isDone: true,
      continueCursor: "done",
    });
  });

  it("skips plain Convex functions without requesting decoders", () => {
    const compile = vi.mocked(SchemaAOTCompiler.compile);
    const group = GroupSpec.make().addFunction(
      FunctionSpec.convexPublicQuery<RegisteredQuery<"public", {}, string>>()(
        "legacy",
      ),
    );
    const artifacts = Result.getOrThrowWith(
      AotCompiler.group("legacy.spec.ts", "legacy", group),
      identity,
    );

    expect(compile).not.toHaveBeenCalled();
    expect(artifacts).toEqual([
      {
        path: "groups/legacy.ts",
        contents: "export const prepare = (_item: unknown): void => {};\n",
      },
    ]);
  });

  it.each(["args", "returns", "error"] as const)(
    "preserves %s thunk failures as tagged compilation errors",
    (failed) => {
      const cause = { failed };
      const fn = FunctionSpec.publicQuery({
        name: "get",
        args: () => {
          if (failed === "args") throw cause;
          return {};
        },
        returns: () => {
          if (failed === "returns") throw cause;
          return Schema.String;
        },
        error: () => {
          if (failed === "error") throw cause;
          return Schema.String;
        },
      });
      const result = AotCompiler.group(
        "notes.spec.ts",
        "notes",
        GroupSpec.make().addFunction(fn),
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure).toBeInstanceOf(SchemaCompilationError);
        expect(result.failure._tag).toBe("SchemaCompilationError");
        expect(result.failure.modulePath).toBe("notes.spec.ts");
        expect(result.failure.cause).toBe(cause);
      }
    },
  );
});

describe("AotCompiler purity", () => {
  it("does not evaluate checks, transforms, defaults, or Suspend thunks while generating code", () => {
    const check = vi.fn(() => true);
    const decode = vi.fn((value: string) => value);
    const encode = vi.fn((value: string) => value);
    const defaultValue = vi.fn(() => "default");
    const suspend = vi.fn(() => Schema.String);
    const fields = Schema.Struct({
      checked: Schema.String.check(Schema.makeFilter(check)),
      transformed: Schema.String.pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform(decode),
          encode: SchemaGetter.transform(encode),
        }),
      ),
      defaulted: Schema.String.pipe(
        Schema.withDecodingDefault(Effect.sync(defaultValue)),
      ),
      suspended: Schema.suspend(suspend),
    });
    const table = Table.make(() => fields)("notes");
    const group = GroupSpec.make().addFunction(
      FunctionSpec.publicQuery({
        name: "get",
        args: () => fields.fields,
        returns: () => fields,
        error: () => fields,
      }),
    );

    expect(Result.isSuccess(AotCompiler.table("tables/notes.ts", table))).toBe(
      true,
    );
    expect(
      Result.isSuccess(AotCompiler.group("notes.spec.ts", "notes", group)),
    ).toBe(true);
    expect(check).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
    expect(defaultValue).not.toHaveBeenCalled();
    expect(suspend).not.toHaveBeenCalled();
  });
});
