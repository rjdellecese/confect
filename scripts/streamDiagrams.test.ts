import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as Record from "effect/Record";
import * as Str from "effect/String";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { cell, diagrams, keys, renderDiagrams, track } from "./streamDiagrams";

const runTest = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

/**
 * The rendered page, or the error's message when rendering fails.
 */
const renderedOrMessage = (source: string): Effect.Effect<string> =>
  renderDiagrams(source).pipe(
    Effect.catchTag("StreamDiagramsError", (error) =>
      Effect.succeed(error.message),
    ),
  );

const block = (name: string): string =>
  `{/* stream-diagram: ${name} */}\n\`\`\`text\nstale\n\`\`\``;

const indexOf = (text: string | undefined, search: string) =>
  text === undefined
    ? undefined
    : Option.getOrElse(Str.indexOf(search)(text), () => -1);

test("tracks and their keys share columns", () => {
  const [name, elements] = Str.split("\n")(
    track("by_text", ["n1", undefined, "n2"]),
  );
  const beneath = keys(["[apple,1]", undefined, "[banana,2]"]);
  expect(name).toBe("by_text");
  expect(
    elements === undefined ? undefined : Str.startsWith("╰")(elements),
  ).toBe(true);
  // Same width before the end marker, so keys sit beneath their elements.
  expect(elements?.length).toBe(beneath.length + 1);
  expect(indexOf(elements, "n2")).toBe(
    Option.getOrElse(Str.indexOf("[banana,2]")(beneath), () => -1),
  );
  expect(cell("n1")).toHaveLength(cell("(n6)").length);
});

test("a track that starts later lines up with the outer track's columns", () => {
  const [, outer] = Str.split("\n")(track("admin", ["n1", undefined, "n4"]));
  const [name, inner] = Str.split("\n")(track("of n4", ["c3"], "┤", 2));
  // The corner sits under the name, and the inner element under the outer one.
  expect(indexOf(inner, "╰")).toBe(indexOf(name, "of n4"));
  expect(indexOf(inner, "c3")).toBe(indexOf(outer, "n4"));
});

test("renders every marked block and leaves the rest of the page alone", () =>
  runTest(
    Effect.gen(function* () {
      const full = yield* renderedOrMessage(
        `intro\n${Array.join(Array.map(Record.keys(diagrams), block), "\n\n")}\noutro`,
      );
      expect(Str.startsWith("intro\n")(full)).toBe(true);
      expect(Str.endsWith("\noutro")(full)).toBe(true);
      expect(full).not.toContain("stale");
      expect(full).toContain(diagrams["legend"]);
    }),
  ));

test("reports a page that is missing a diagram's block", () =>
  runTest(
    Effect.gen(function* () {
      const message = yield* renderedOrMessage(
        `intro\n${block("legend")}\noutro`,
      );
      expect(message).toContain("has no block for");
    }),
  ));

test("rejects a marker for a diagram that doesn't exist", () =>
  runTest(
    Effect.gen(function* () {
      const message = yield* renderedOrMessage(block("nope"));
      expect(message).toContain("unknown diagram: nope");
    }),
  ));
