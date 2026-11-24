import * as Namespace from "alchemy/Namespace";
import type * as Output from "alchemy/Output";
import type * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import { Code, EnvironmentVariables } from "./internal/Resources.js";

type Input<T> = T | Config.Config<T> | Output.Output<T, unknown>;
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
              deploymentName: props.deployment.name,
              url: props.deployment.url,
              deployKey: props.deployKey,
              variables: props.env,
            });
      const code = yield* Code("Code", {
        deployment: {
          name: props.deployment.name,
          url:
            environment === undefined ? props.deployment.url : environment.url,
        },
        deployKey: props.deployKey,
        ...(props.cwd === undefined ? {} : { cwd: props.cwd }),
        prepare: { command: "confect", args: ["codegen"] },
      });
      return { code, environment, name: code.name, url: code.url };
    }),
  );

export { ConflictingEnvironmentNames } from "./internal/DomainErrors.js";
