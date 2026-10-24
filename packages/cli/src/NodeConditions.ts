import { parseArgs } from "node:util";
import * as Array from "effect/Array";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export class InvalidNodeOptions extends Schema.TaggedError<InvalidNodeOptions>()(
  "InvalidNodeOptions",
  {
    reason: Schema.Literals([
      "InvalidEscape",
      "UnterminatedString",
      "InvalidArguments",
    ]),
  },
) {}

export const tokenize = (
  input: string,
): Result.Result<ReadonlyArray<string>, InvalidNodeOptions> => {
  const args: string[] = [];
  let quoted = false;
  let starting = true;
  for (let index = 0; index < input.length; index++) {
    let character = input.charAt(index);
    if (character === "\\" && quoted) {
      if (++index === input.length)
        return Result.fail(new InvalidNodeOptions({ reason: "InvalidEscape" }));
      character = input.charAt(index);
    } else if (character === " " && !quoted) {
      starting = true;
      continue;
    } else if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (starting) {
      args.push(character);
      starting = false;
    } else {
      args[args.length - 1] += character;
    }
  }
  return quoted
    ? Result.fail(new InvalidNodeOptions({ reason: "UnterminatedString" }))
    : Result.succeed(args);
};

export const parse = (
  nodeOptions: string,
  execArgv: ReadonlyArray<string>,
  requireModule: boolean,
): Result.Result<ReadonlyArray<string>, InvalidNodeOptions> =>
  Result.gen(function* () {
    const environment = yield* tokenize(nodeOptions);
    const { tokens } = yield* Result.try({
      try: () =>
        parseArgs({
          args: [...environment, ...execArgv],
          options: {
            conditions: { type: "string", short: "C", multiple: true },
            addons: { type: "boolean" },
            "no-addons": { type: "boolean" },
          },
          strict: false,
          allowPositionals: true,
          tokens: true,
        }),
      catch: () => new InvalidNodeOptions({ reason: "InvalidArguments" }),
    });
    let addons = true;
    const custom: string[] = [];
    for (const token of tokens) {
      if (token.kind !== "option") continue;
      switch (token.name.replaceAll("_", "-")) {
        case "conditions":
          if (token.value === undefined || token.value === "")
            return yield* Result.fail(
              new InvalidNodeOptions({ reason: "InvalidArguments" }),
            );
          custom.push(token.value);
          break;
        case "addons":
          addons = true;
          break;
        case "no-addons":
          addons = false;
          break;
      }
    }
    return Array.dedupe([
      "node",
      ...(requireModule ? ["module-sync"] : []),
      ...(addons ? ["node-addons"] : []),
      ...custom,
    ]);
  });

export const current = Effect.gen(function* () {
  const nodeOptions = yield* Config.String("NODE_OPTIONS").pipe(
    Config.withDefault(""),
  );
  return yield* Effect.fromResult(
    parse(nodeOptions, process.execArgv, process.features.require_module),
  );
});
