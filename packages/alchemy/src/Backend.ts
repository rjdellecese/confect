import type { Input } from "alchemy/Input";
import * as Namespace from "alchemy/Namespace";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import { Code } from "./Code";
import { EnvironmentVariables } from "./EnvironmentVariables";

export interface BackendProps {
  readonly deployment: {
    readonly name: Input<string>;
    readonly url: Input<string>;
  };
  readonly deployKey: Input<Redacted.Redacted<string>>;
  readonly cwd?: string;
  readonly env?: Readonly<
    Record<string, Input<string | Redacted.Redacted<string>>>
  >;
}

export const Backend = (id: string, props: BackendProps) =>
  Namespace.push(
    id,
    Effect.gen(function* () {
      const environment =
        props.env === undefined
          ? undefined
          : yield* EnvironmentVariables("Environment", {
              url: props.deployment.url,
              deployKey: props.deployKey,
              variables: props.env,
            });
      const code = yield* Code("Code", {
        deployment: {
          name: props.deployment.name,
          url: environment
            ? Output.map(
                Output.all(environment.variables, environment.url),
                ([, url]) => url,
              )
            : props.deployment.url,
        },
        deployKey: props.deployKey,
        ...(props.cwd === undefined ? {} : { cwd: props.cwd }),
        prepare: { command: "confect", args: ["codegen"] },
      });
      return { code, environment, name: code.name, url: code.url };
    }),
  );
