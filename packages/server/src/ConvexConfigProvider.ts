import type {
  AppDefinition,
  ComponentDefinition,
  EnvFromAppDefinition,
  EnvFromDefinition,
} from "convex/server";
import { Config, ConfigProvider, type Option } from "effect";

declare const process: { env: Record<string, string | undefined> };

type FromEnvOptions = Parameters<typeof ConfigProvider.fromEnv>[0];

type StringKey<Env> = keyof Env & string;

type OptionalStringKey<Env> = {
  [Key in StringKey<Env>]-?: undefined extends Env[Key] ? Key : never;
}[StringKey<Env>];

/**
 * Build a `ConfigProvider` that reads from `process.env` at Convex function
 * runtime.
 *
 * Effect 4's `ConfigProvider.fromEnv` would normally use `import.meta.env`,
 * which the Convex bundler cannot statically analyze (see effect-smol#2143).
 * Pass an explicit env snapshot at construction time to side-step that.
 */
export const make = (
  options?: FromEnvOptions,
): ConfigProvider.ConfigProvider => {
  const env: Record<string, string> = { ...options?.env };
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !(key in env)) {
      env[key] = value;
    }
  }
  return ConfigProvider.fromEnv({ ...options, env });
};

export type EnvFromComponentDefinition<ComponentDefinition_> =
  ComponentDefinition_ extends ComponentDefinition<any, infer Env>
    ? EnvFromDefinition<Env>
    : never;

const string =
  <Env>() =>
  <Key extends StringKey<Env>>(
    key: Key,
  ): Config.Config<Extract<Env[Key], string>> =>
    Config.string(key) as Config.Config<Extract<Env[Key], string>>;

const option =
  <Env>() =>
  <Key extends OptionalStringKey<Env>>(
    key: Key,
  ): Config.Config<Option.Option<Extract<Env[Key], string>>> =>
    Config.option(Config.string(key)) as Config.Config<
      Option.Option<Extract<Env[Key], string>>
    >;

export const fromApp = <App extends AppDefinition<any>>() => ({
  string: string<EnvFromAppDefinition<App>>(),
  option: option<EnvFromAppDefinition<App>>(),
});

export const fromComponent = <
  ComponentDefinition_ extends ComponentDefinition<any, any>,
>() => ({
  string: string<EnvFromComponentDefinition<ComponentDefinition_>>(),
  option: option<EnvFromComponentDefinition<ComponentDefinition_>>(),
});

export const fromEnv = <Env>() => ({
  string: string<Env>(),
  option: option<Env>(),
});
