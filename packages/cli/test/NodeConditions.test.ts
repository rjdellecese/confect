import { describe, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import * as NodeConditions from "@confect/cli/NodeConditions";

describe("NodeConditions", () => {
  it.each([
    ["", []],
    [
      ' --conditions="two words"  -C other ',
      ["--conditions=two words", "-C", "other"],
    ],
    [String.raw`--conditions="a\"b\\c"`, ['--conditions=a"b\\c']],
    ["--conditions='literal'", ["--conditions='literal'"]],
    ['"" --conditions=foo\tbar', ["--conditions=foo\tbar"]],
    [String.raw`--conditions=a\b`, [String.raw`--conditions=a\b`]],
  ] as const)("tokenizes Node's environment syntax: %s", (input, expected) => {
    expect(NodeConditions.tokenize(input)).toEqual(Result.succeed(expected));
  });

  it.each([
    ['--conditions="unfinished', "UnterminatedString"],
    ['--conditions="unfinished\\', "InvalidEscape"],
  ] as const)("rejects malformed environment quoting: %s", (input, reason) => {
    expect(NodeConditions.tokenize(input)).toEqual(
      Result.fail(new NodeConditions.InvalidNodeOptions({ reason })),
    );
  });

  it("combines repeated conditions and honors the last addon toggle", () => {
    const argv = ["--addons", "-C", "cli", "--conditions=env"];
    expect(
      NodeConditions.parse("--no-addons --conditions=env", argv, true),
    ).toEqual(
      Result.succeed(["node", "module-sync", "node-addons", "env", "cli"]),
    );
    expect(argv).toEqual(["--addons", "-C", "cli", "--conditions=env"]);
    expect(NodeConditions.parse("--addons", ["--no_addons"], false)).toEqual(
      Result.succeed(["node"]),
    );
  });

  it("preserves explicit builtin conditions and unrelated option values", () => {
    expect(
      NodeConditions.parse(
        '--title="--no-addons" -C node-addons',
        ["--no-addons"],
        false,
      ),
    ).toEqual(Result.succeed(["node", "node-addons"]));
  });
});
