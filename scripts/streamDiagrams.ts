import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Runtime from "effect/Runtime";

/**
 * Generates the stream diagrams on the Streams docs page.
 *
 * A diagram is a set of tracks. A track is read left to right in key order
 * — the marble-diagram convention, with the index's ordering as the axis in
 * place of time. Its name sits on the line above it, and the track curls up
 * into the name (`╰`) rather than sitting beside it, so the diagram is no
 * wider than its columns. Every track in one diagram shares the same
 * columns, so elements that line up vertically hold the same position in
 * the output's order. Generating them keeps the notation consistent and the
 * columns aligned; the page marks each block with an MDX comment naming the
 * diagram (`stream-diagram: name`) and this script fills in the fenced
 * `text` block that follows.
 */

const PAGE = "apps/docs/server/database/streams.mdx";
const COLUMN_WIDTH = 12;
/** Joins a track to the name printed above it. */
const CORNER = "╰";

export class StreamDiagramsError extends Data.TaggedError(
  "StreamDiagramsError",
)<{
  readonly reason: string;
}> {
  readonly [Runtime.errorReported] = false;

  override get message(): string {
    return this.reason;
  }
}

/** A column's element label, or `undefined` for a stretch of empty track. */
type Cell = string | undefined;

export const cell = (label: string): string =>
  `─ ${label} `.padEnd(COLUMN_WIDTH, "─");

const gap = "─".repeat(COLUMN_WIDTH);

const keyCell = (key: string): string => `  ${key}`.padEnd(COLUMN_WIDTH);

/**
 * A track: a named stream, one cell per column, ending in `end`. The name
 * is printed on the line above, and the track starts with the corner that
 * joins it to the name. `start` shifts both right by that many columns —
 * an inner stream of a join begins where its outer element is.
 */
export const track = (
  name: string,
  cells: ReadonlyArray<Cell>,
  end = "┤",
  start = 0,
): string => {
  const indent = " ".repeat(COLUMN_WIDTH * start);
  return (
    indent +
    name +
    "\n" +
    indent +
    CORNER +
    cells.map((label) => (label === undefined ? gap : cell(label))).join("") +
    end
  );
};

/** The keys printed beneath a track's elements. */
export const keys = (values: ReadonlyArray<Cell>): string =>
  " " +
  values
    .map((key) => (key === undefined ? " ".repeat(COLUMN_WIDTH) : keyCell(key)))
    .join("");

/** The operation between an input track and its output. */
const op = (text: string): string => `╞═ ${text} ═╡`;

const lines = (...rows: ReadonlyArray<string>): string =>
  rows.map((row) => row.trimEnd()).join("\n");

/** A cursor between two keys, drawn at the start of column `column`. */
const cursorAt = (column: number): string =>
  " ".repeat(1 + COLUMN_WIDTH * column) + "╎";

const BY_TEXT = ["n1", "n3", "n2", "n5", "n4", "n6"];
const BY_TEXT_KEYS = [
  "[apple,1]",
  "[apple,3]",
  "[banana,2]",
  "[banana,5]",
  "[cherry,4]",
  "[date,6]",
];
const FILTERED = ["n1", "n3", "n2", "n5", "n4", "(n6)"];

export const diagrams: Readonly<Record<string, string>> = {
  legend: lines(track("by_text", BY_TEXT), keys(BY_TEXT_KEYS)),

  creating: lines(
    track("by_text", BY_TEXT),
    keys(BY_TEXT_KEYS),
    "",
    track("by_text desc", ["n6", "n4", "n5", "n2", "n3", "n1"]),
    keys([
      "[date,6]",
      "[cherry,4]",
      "[banana,5]",
      "[banana,2]",
      "[apple,3]",
      "[apple,1]",
    ]),
    "",
    track('gte "banana"', [undefined, undefined, "n2", "n5", "n4", "n6"]),
    keys([
      undefined,
      undefined,
      "[banana,2]",
      "[banana,5]",
      "[cherry,4]",
      "[date,6]",
    ]),
    "",
    track('eq "apple"', ["n1", "n3"]),
    keys(["[1]", "[3]"]),
  ),

  empty: lines(track("nothing", [])),

  unique: lines(
    `${track('eq "cherry"', ["n4"])}   → Some(n4)`,
    keys(["[4]"]),
    "",
    `${track('eq "apple"', ["n1", "n3"])}   → NotUniqueError`,
    keys(["[1]", "[3]"]),
    "",
    `${track('eq "fig"', [])}   → None`,
  ),

  merge: lines(
    track("admin", ["n1", undefined, undefined, "n4", "n5", undefined]),
    keys(["[1]", undefined, undefined, "[4]", "[5]", undefined]),
    track("user", [undefined, "n2", "n3", undefined, undefined, "n6"]),
    keys([undefined, "[2]", "[3]", undefined, undefined, "[6]"]),
    "",
    op("merge([admin, user])"),
    "",
    track("merged", ["n1", "n2", "n3", "n4", "n5", "n6"]),
    keys(["[1]", "[2]", "[3]", "[4]", "[5]", "[6]"]),
  ),

  "filter-map": lines(
    track("by_text", BY_TEXT),
    keys(BY_TEXT_KEYS),
    "",
    op('filter((note) => note.tag !== "hidden")'),
    "",
    track("filtered", FILTERED),
    keys(BY_TEXT_KEYS),
    "",
    op("map((note) => note.text)"),
    "",
    track("mapped", ["apple", "apple", "banana", "banana", "cherry", "(n6)"]),
    keys(BY_TEXT_KEYS),
  ),

  "flat-map": lines(
    track("admin", ["n1", undefined, "n4", "n5"]),
    keys(["[1]", undefined, "[4]", "[5]"]),
    track("of n1", ["c1", "c2"], "┤", 0),
    track("of n4", ["c3"], "┤", 2),
    track("of n5", [], "┤", 3),
    "",
    op('flatMap((note) => commentsOn(note), { innerKey: ["_creationTime"] })'),
    "",
    track("joined", ["c1", "c2", "c3", "(n5)"]),
    keys(["[1,7]", "[1,8]", "[4,9]", "[5,null]"]),
  ),

  "on-empty": lines(
    track("admin", ["n1", undefined, "n4", "n5"]),
    keys(["[1]", undefined, "[4]", "[5]"]),
    track("of n1", ["c1", "c2"], "┤", 0),
    track("of n4", ["c3"], "┤", 2),
    track("of n5", [], "┤", 3),
    "",
    op("flatMap((note) => commentsOn(note), { innerKey, onEmpty })"),
    "",
    track("joined", ["c1", "c2", "c3", "∅n5"]),
    keys(["[1,7]", "[1,8]", "[4,9]", "[5,null]"]),
  ),

  distinct: lines(
    track("by_text", BY_TEXT),
    keys(BY_TEXT_KEYS),
    "",
    op('distinct(["text"])'),
    "",
    track("distinct", ["n1", undefined, "n2", undefined, "n4", "n6"]),
    keys([
      "[apple,1]",
      undefined,
      "[banana,2]",
      undefined,
      "[cherry,4]",
      "[date,6]",
    ]),
  ),

  "rename-key": lines(
    track("by_body", ["c1", "c2", "c3"]),
    `${keys(["[great,7]", "[meh,8]", "[nice,9]"])}   key: [body, _creationTime]`,
    "",
    op('renameKey(["text", "_creationTime"])'),
    "",
    track("relabeled", ["c1", "c2", "c3"]),
    `${keys(["[great,7]", "[meh,8]", "[nice,9]"])}   key: [text, _creationTime]`,
  ),

  "rename-key-merge": lines(
    track("notes", [...BY_TEXT, undefined, undefined, undefined]),
    track("relabeled", [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "c1",
      "c2",
      "c3",
    ]),
    "",
    op("merge([notes, relabeled])"),
    "",
    track("merged", [...BY_TEXT, "c1", "c2", "c3"]),
    keys([...BY_TEXT_KEYS, "[great,7]", "[meh,8]", "[nice,9]"]),
  ),

  reverse: lines(
    track("merged", ["n1", "n2", "n3", "n4", "n5", "n6"]),
    keys(["[1]", "[2]", "[3]", "[4]", "[5]", "[6]"]),
    "",
    op("reverse"),
    "",
    track("reversed", ["n6", "n5", "n4", "n3", "n2", "n1"]),
    keys(["[6]", "[5]", "[4]", "[3]", "[2]", "[1]"]),
  ),

  narrow: lines(
    track("by_text", BY_TEXT),
    keys(BY_TEXT_KEYS),
    `${cursorAt(3)} after${" ".repeat(COLUMN_WIDTH * 2 - 7)}╎ until`,
    "",
    op("narrow({ after: [banana, 2], until: [cherry, 4] })"),
    "",
    track("narrowed", [undefined, undefined, undefined, "n5", "n4"]),
    keys([undefined, undefined, undefined, "[banana,5]", "[cherry,4]"]),
  ),

  paginate: lines(
    track("filtered", FILTERED),
    keys(BY_TEXT_KEYS),
    "",
    op("paginate({ numItems: 2, cursor: null })"),
    "",
    `${track("page 1", ["n1", "n3"], "╎")}  continueCursor: [apple,3]`,
    "",
    op("paginate({ numItems: 2, cursor: [apple,3] })"),
    "",
    `${cursorAt(2)}${cell("n2").slice(1)}${cell("n5")}╎  continueCursor: [banana,5]`,
    "",
    op("paginate({ numItems: 2, cursor: [banana,5] })"),
    "",
    `${cursorAt(4)}${cell("n4").slice(1)}${cell("(n6)")}┤  isDone: true`,
  ),

  "end-cursor": lines(
    track("filtered", FILTERED),
    keys(BY_TEXT_KEYS),
    "",
    op("paginate({ cursor: [apple,3], endCursor: [banana,5], numItems: 2 })"),
    "",
    `${cursorAt(2)}${cell("n2").slice(1)}${cell("n5")}╎  exactly this range, however many documents it holds`,
  ),
};

// The formatter keeps a blank line between an MDX comment and a fence.
const MARKED_BLOCK =
  /\{\/\* stream-diagram: ([a-z-]+) \*\/\}\n\n?```text\n[\s\S]*?\n```/g;

/** The page with every marked diagram block regenerated. */
export const renderDiagrams = Effect.fnUntraced(function* (
  source: string,
): Effect.fn.Return<string, StreamDiagramsError> {
  const seen = new Set<string>();
  let unknown: string | undefined;
  const rendered = source.replace(MARKED_BLOCK, (match, name: string) => {
    const diagram = diagrams[name];
    if (diagram === undefined) {
      unknown ??= name;
      return match;
    }
    seen.add(name);
    return `{/* stream-diagram: ${name} */}\n\n\`\`\`text\n${diagram}\n\`\`\``;
  });
  if (unknown !== undefined) {
    return yield* new StreamDiagramsError({
      reason: `${PAGE} references an unknown diagram: ${unknown}`,
    });
  }
  const unused = Object.keys(diagrams).filter((name) => !seen.has(name));
  if (unused.length > 0) {
    return yield* new StreamDiagramsError({
      reason: `${PAGE} has no block for: ${unused.join(", ")}`,
    });
  }
  return rendered;
});

export interface SyncOptions {
  readonly check?: boolean;
  readonly cwd?: string;
}

export const syncStreamDiagrams = Effect.fn("StreamDiagrams.sync")(function* (
  options: SyncOptions = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pagePath = path.join(options.cwd ?? process.cwd(), PAGE);
  const source = yield* fs.readFileString(pagePath);
  const rendered = yield* renderDiagrams(source);

  if (rendered === source) {
    yield* Console.log(`ok  ${PAGE} diagrams are up to date`);
    return;
  }

  if (options.check === true) {
    return yield* new StreamDiagramsError({
      reason: `${PAGE} diagrams are stale; run \`pnpm docs:stream-diagrams\``,
    });
  }

  yield* fs.writeFileString(pagePath, rendered);
  yield* Console.log(`updated ${PAGE} diagrams`);
});

export const streamDiagramsMain = Effect.fn("StreamDiagrams.main")(function* (
  args: ReadonlyArray<string>,
) {
  const unknownArgument = args.find((argument) => argument !== "--check");
  if (unknownArgument !== undefined) {
    return yield* new StreamDiagramsError({
      reason: `Unknown argument: ${unknownArgument}`,
    });
  }
  yield* syncStreamDiagrams({ check: args.includes("--check") });
});

if (import.meta.main) {
  streamDiagramsMain(Bun.argv.slice(2)).pipe(
    Effect.tapErrorTag("StreamDiagramsError", (error) =>
      Console.error(error.message),
    ),
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
