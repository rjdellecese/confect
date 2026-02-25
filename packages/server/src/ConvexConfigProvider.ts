import {
  Array,
  ConfigError,
  ConfigProvider,
  ConfigProviderPathPatch,
  Effect,
  pipe,
} from "effect";

declare const process: { env: Record<string, string | undefined> };

export const make = (
  options?: Partial<ConfigProvider.ConfigProvider.FromEnvConfig>,
): ConfigProvider.ConfigProvider => {
  const pathDelim = options?.pathDelim ?? "_";
  const seqDelim = options?.seqDelim ?? ",";

  return ConfigProvider.fromFlat(
    ConfigProvider.makeFlat({
      load: (path, primitive, split = true) => {
        const pathString = Array.join(path, pathDelim);
        const value = process.env[pathString];

        if (value === undefined) {
          return Effect.fail(
            ConfigError.MissingData(
              [...path],
              `Expected ${pathString} to exist in the process context`,
            ),
          );
        }

        const parse = (text: string) =>
          pipe(
            primitive.parse(text.trim()),
            Effect.mapError(ConfigError.prefixed([...path])),
          );

        if (!split) {
          return pipe(parse(value), Effect.map(Array.of));
        } else {
          return pipe(
            value.split(seqDelim),
            Effect.forEach((v) => parse(v)),
          );
        }
      },
      enumerateChildren: (path) =>
        Effect.fail(
          ConfigError.Unsupported(
            [...path],
            "process.env is not enumerable in the Convex runtime",
          ),
        ),
      patch: ConfigProviderPathPatch.empty,
    }),
  );
};
