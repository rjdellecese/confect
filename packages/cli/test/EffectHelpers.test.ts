import { CodeBlockWriter } from "@confect/cli/CodeBlockWriter";
import * as templates from "@confect/cli/templates";
import { assert, expect, expectTypeOf, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Tracer from "effect/Tracer";

it.effect(
  "captures template arguments at the call and allocates writers per run",
  () =>
    Effect.gen(function* () {
      let reads = 0;
      const options = {
        functionNames: ["first"],
        registeredFunctionsImportPath: "./original",
        get useNode() {
          reads += 1;
          return false;
        },
      };
      const render = templates.functions(options);
      expect(reads).toBe(1);
      options.functionNames = ["replacement"];
      options.registeredFunctionsImportPath = "./replacement";

      const first = yield* render;
      const second = yield* render;
      expect(first).toBe(second);
      expect(first).toContain('from "./original"');
      expect(first).toContain("export const first");
      expect(first).not.toContain("replacement");
      expect(first).not.toContain('"use node"');
      expect(reads).toBe(1);
      const defaultOptions: Parameters<typeof templates.functions>[0] = {
        functionNames: ["defaulted"],
        registeredFunctionsImportPath: "./defaulted",
      };
      const defaultRender = templates.functions(defaultOptions);
      defaultOptions.useNode = true;
      expect(yield* defaultRender).not.toContain('"use node"');
      expect(
        yield* templates.functions({
          functionNames: ["next"],
          registeredFunctionsImportPath: "./next",
          useNode: true,
        }),
      ).toContain('"use node"');
    }),
);

it.effect(
  "renders nested assembly repeatedly without accumulating writer state",
  () =>
    Effect.gen(function* () {
      const render = templates.assembledSpec({
        nodes: [
          {
            segment: "parent",
            importBinding: Option.none(),
            children: [
              {
                segment: "child",
                importBinding: Option.none(),
                children: [],
              },
            ],
          },
        ],
      });
      const first = yield* render;
      expect(yield* render).toBe(first);
      expect(first).toContain(
        '.addGroupAt("child", GroupSpec.makeAt("child"))',
      );
    }),
);

class Line extends Context.Service<Line, string>()(
  "@confect/cli/test/EffectHelpers.test/Line",
) {}

it.effect(
  "preserves the indent prototype method, receiver, and generic channels",
  () =>
    Effect.gen(function* () {
      const first = new CodeBlockWriter({ indentNumberOfSpaces: 2 });
      const second = new CodeBlockWriter({ indentNumberOfSpaces: 4 });
      const receiver = CodeBlockWriter.prototype.indent.bind(second);
      let runs = 0;
      const line = Effect.andThen(Line, (text) => {
        runs += 1;
        return text === "fail"
          ? Effect.fail("failure" as const)
          : second.writeLine(text);
      });
      const indented = second.indent(line);
      expectTypeOf(indented).toEqualTypeOf<
        Effect.Effect<void, "failure", Line>
      >();
      expect(Object.hasOwn(second, "indent")).toBe(false);
      expect(runs).toBe(0);
      expect(yield* second.toString()).toBe("");

      yield* indented.pipe(Effect.provideService(Line, "line"));
      yield* indented.pipe(Effect.provideService(Line, "again"));
      yield* receiver(second.writeLine("bound"));
      yield* second.writeLine("outside");
      expect(yield* first.toString()).toBe("");
      expect(yield* second.toString()).toBe(
        "    line\n    again\n    bound\noutside\n",
      );
      expect(runs).toBe(2);

      const failed = yield* indented.pipe(
        Effect.provideService(Line, "fail"),
        Effect.result,
      );
      assert(Result.isFailure(failed));
      expect(failed.failure).toBe("failure");
    }),
);

it.effect("keeps internal helpers within their caller's span", () =>
  Effect.gen(function* () {
    const spans: Array<Tracer.Span> = [];
    const tracer = Tracer.make({
      span(options) {
        const span = new Tracer.NativeSpan(options);
        spans.push(span);
        return span;
      },
    });
    const writer = new CodeBlockWriter();
    const parentName = yield* writer
      .indent(
        Effect.gen(function* () {
          expect((yield* Effect.currentSpan).name).toBe("caller");
          yield* templates.services({ schemaImportPath: "./schema" });
        }),
      )
      .pipe(
        Effect.andThen(Effect.map(Effect.currentSpan, (span) => span.name)),
        Effect.withSpan("caller"),
        Effect.provideService(Tracer.Tracer, tracer),
      );
    expect(parentName).toBe("caller");
    expect(spans.map((span) => span.name)).toEqual(["caller"]);
  }),
);
