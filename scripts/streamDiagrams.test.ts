import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import { cell, diagrams, keys, renderDiagrams, track } from "./streamDiagrams";

const runTest = <A, E>(effect: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(effect);

/** The rendered page, or the error's message when rendering fails. */
const renderedOrMessage = (source: string): Effect.Effect<string> =>
  renderDiagrams(source).pipe(
    Effect.catchTag("StreamDiagramsError", (error) =>
      Effect.succeed(error.message),
    ),
  );

const block = (name: string): string =>
  `{/* stream-diagram: ${name} */}\n\`\`\`text\nstale\n\`\`\``;

test("tracks and their keys share columns", () => {
  const elements = track("by_text", ["n1", undefined, "n2"]);
  const beneath = keys("", ["[apple,1]", undefined, "[banana,2]"]);
  // Same width before the end marker, so keys sit beneath their elements.
  expect(elements.length - 1).toBe(beneath.length);
  expect(elements.indexOf("n2")).toBe(beneath.indexOf("[banana,2]"));
  expect(cell("n1")).toHaveLength(cell("(n6)").length);
});

test("renders every marked block and leaves the rest of the page alone", () =>
  runTest(
    Effect.gen(function* () {
      const full = yield* renderedOrMessage(
        `intro\n${Object.keys(diagrams).map(block).join("\n\n")}\noutro`,
      );
      expect(full.startsWith("intro\n")).toBe(true);
      expect(full.endsWith("\noutro")).toBe(true);
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
