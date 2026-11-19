import type { Input } from "alchemy/Input";
import * as Namespace from "alchemy/Namespace";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
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

export class ConflictingEnvironmentNames extends Schema.TaggedError<
  ConflictingEnvironmentNames,
  { readonly brand: unique symbol }
>()("ConflictingEnvironmentNames", {
  names: Schema.Tuple([Schema.Literal("Type"), Schema.Literal("FQN")]),
}) {}

export const Backend = (id: string, props: BackendProps) =>
  Namespace.push(
    id,
    Effect.gen(function* () {
      if (props.env !== undefined && "Type" in props.env && "FQN" in props.env)
        return yield* Effect.die(
          ConflictingEnvironmentNames.make({
            names: ["Type", "FQN"],
          }),
        );
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
            environment !== undefined
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
