import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import type { Providers } from "./Providers";
import { deploy } from "./internal/CodeDeployment";
import { CommandRunner, type PrepareCommand } from "./internal/CommandRunner";

export interface CodeProps {
  readonly deployment: { readonly name: string; readonly url: string };
  readonly deployKey: Redacted.Redacted<string>;
  readonly cwd?: string;
  readonly prepare?: PrepareCommand;
}

export interface CodeAttributes {
  readonly name: string;
  readonly url: string;
}

export type Code = Resource<
  "Convex.Code",
  CodeProps,
  CodeAttributes,
  never,
  Providers
>;
export const Code = Resource<Code>("Convex.Code");

export const provider = Effect.gen(function* () {
  const runner = yield* CommandRunner;
  return {
    read: ({ output }) => Effect.succeed(output),
    diff: () => Effect.succeed({ action: "update" }),
    reconcile: ({ news }) =>
      deploy(news).pipe(Effect.provideService(CommandRunner, runner)),
    delete: () => Effect.void,
  } satisfies Provider.ProviderServiceInput<Code>;
});

export const layer = Provider.effect(Code, provider);
