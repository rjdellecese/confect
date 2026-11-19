import type { ManagementApi } from "@confect/platform";
import { ProviderCollection } from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import type { PropsInput } from "alchemy/Input";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import { declarationNames } from "./VariableNames.js";
import { UnresolvedEnvironmentVariableNames } from "./DomainErrors.js";
import type * as Redacted from "effect/Redacted";

export class Providers extends ProviderCollection<Providers>()(
  "@confect/alchemy/Providers",
) {}

export interface ProjectProps {
  readonly teamId: number;
  readonly name?: string;
}
export interface ProjectAttributes {
  readonly projectId: number;
  readonly teamId: number;
  readonly name: string;
  readonly managedName?: string;
  readonly slug: string;
}
export interface DeploymentProps {
  readonly projectId: number;
  readonly type: ManagementApi.CreateDeploymentType;
  readonly reference?: string;
  readonly region?: ManagementApi.RegionName;
}
export interface DeploymentAttributes {
  readonly projectId: number;
  readonly name: string;
  readonly reference: string;
  readonly managedReference?: string;
  readonly type: ManagementApi.CreateDeploymentType;
  readonly url: string;
  readonly region: ManagementApi.RegionName;
}
export interface DeployKeyProps {
  readonly deploymentName: string;
  readonly name?: string;
  readonly allowedActions?: ReadonlyArray<
    NonNullable<
      ManagementApi.PlatformCreateDeployKeyArgs["allowedActions"]
    >[number]
  >;
}
export interface DeployKeyAttributes {
  readonly deploymentName: string;
  readonly keyId: number;
  readonly name: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly allowedActions: ReadonlyArray<string>;
}
export interface PrepareCommand {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}
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
export interface EnvironmentVariablesProps {
  readonly deploymentName?: string;
  readonly url: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly variables: Readonly<
    Record<string, string | Redacted.Redacted<string>>
  >;
}
export interface EnvironmentVariablesAttributes {
  readonly url: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly ownedNames: ReadonlyArray<string>;
  readonly variables: Readonly<Record<string, Redacted.Redacted<string>>>;
  readonly originals: Readonly<Record<string, Redacted.Redacted<string>>>;
}
export interface AuthoritativeEnvironmentVariableProps {
  readonly deployment: { readonly name: string; readonly url: string };
  readonly deployKey: Redacted.Redacted<string>;
  readonly name: string;
  readonly value: string | Redacted.Redacted<string>;
}
export interface AuthoritativeEnvironmentVariableAttributes {
  readonly name: string;
  readonly url: string;
}
export type Project = Resource<
  "Convex.Project",
  ProjectProps,
  ProjectAttributes,
  never,
  Providers
>;
export const Project = Resource<Project>("Convex.Project", {
  defaultRemovalPolicy: "retain",
});
export type Deployment = Resource<
  "Convex.Deployment",
  DeploymentProps,
  DeploymentAttributes,
  never,
  Providers
>;
export const Deployment = Resource<Deployment>("Convex.Deployment", {
  defaultRemovalPolicy: "retain",
});
export type DeployKey = Resource<
  "Convex.DeployKey",
  DeployKeyProps,
  DeployKeyAttributes,
  never,
  Providers
>;
export const DeployKey = Resource<DeployKey>("Convex.DeployKey");
export type Code = Resource<
  "Convex.Code",
  CodeProps,
  CodeAttributes,
  never,
  Providers
>;
export const Code = Resource<Code>("Convex.Code");
export type EnvironmentVariables = Resource<
  "Convex.EnvironmentVariables",
  EnvironmentVariablesProps,
  EnvironmentVariablesAttributes,
  never,
  Providers
>;
const environmentClass = Resource<EnvironmentVariables>(
  "Convex.EnvironmentVariables",
);
function checkedEnvironment<R = never>(
  id: string,
  props:
    | PropsInput<EnvironmentVariablesProps>
    | Effect.Effect<PropsInput<EnvironmentVariablesProps>, never, R>,
): Effect.Effect<EnvironmentVariables, never, Providers | R>;
function checkedEnvironment(methods: object): typeof environmentClass;
function checkedEnvironment<R = never>(
  id: string | object,
  props?:
    | PropsInput<EnvironmentVariablesProps>
    | Effect.Effect<PropsInput<EnvironmentVariablesProps>, never, R>,
) {
  if (typeof id !== "string") return Object.assign(EnvironmentVariables, id);
  if (props === undefined)
    return Effect.die(UnresolvedEnvironmentVariableNames.make({}));
  return environmentClass(
    id,
    Effect.gen(function* () {
      const input = Effect.isEffect(props) ? yield* props : props;
      yield* Effect.fromResult(declarationNames(input)).pipe(Effect.orDie);
      return input;
    }),
  );
}
export const EnvironmentVariables: typeof environmentClass = Object.assign(
  checkedEnvironment,
  environmentClass,
  Effectable.Prototype<Effect.Effect<typeof environmentClass>>({
    label: "Convex.EnvironmentVariables",
    evaluate: () => Effect.succeed(EnvironmentVariables),
  }),
);
export type AuthoritativeEnvironmentVariable = Resource<
  "Convex.AuthoritativeEnvironmentVariable",
  AuthoritativeEnvironmentVariableProps,
  AuthoritativeEnvironmentVariableAttributes,
  never,
  Providers
>;
export const AuthoritativeEnvironmentVariable =
  Resource<AuthoritativeEnvironmentVariable>(
    "Convex.AuthoritativeEnvironmentVariable",
    { defaultRemovalPolicy: "retain" },
  );
