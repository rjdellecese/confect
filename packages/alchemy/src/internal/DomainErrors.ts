import * as Schema from "effect/Schema";
export class ProjectTeamChange extends Schema.TaggedError<
  ProjectTeamChange,
  { readonly brand: unique symbol }
>()("ProjectTeamChange", {
  projectId: Schema.Int,
  teamId: Schema.Int,
  requestedTeamId: Schema.Int,
}) {
  override get message() {
    return `Changing teamId would move the project to a different team.`;
  }
}

export class AmbiguousProject extends Schema.TaggedError<
  AmbiguousProject,
  { readonly brand: unique symbol }
>()("AmbiguousProject", {
  teamId: Schema.Int,
  projectName: Schema.String,
  projectIds: Schema.Array(Schema.Int),
}) {
  override get message() {
    return `More than one project matches the requested name.`;
  }
}

export class DeploymentIdentityChange extends Schema.TaggedError<
  DeploymentIdentityChange,
  { readonly brand: unique symbol }
>()("DeploymentIdentityChange", {
  deploymentName: Schema.String,
  field: Schema.String,
  current: Schema.String,
  requested: Schema.String,
}) {
  override get message() {
    return `Cannot reconcile deployment: conflicting ${this.field}.`;
  }
}

export class UnsupportedLocalDeployment extends Schema.TaggedError<
  UnsupportedLocalDeployment,
  { readonly brand: unique symbol }
>()("UnsupportedLocalDeployment", { deploymentName: Schema.String }) {
  override get message() {
    return `Local deployments are not supported.`;
  }
}

export class AmbiguousDeployment extends Schema.TaggedError<
  AmbiguousDeployment,
  { readonly brand: unique symbol }
>()("AmbiguousDeployment", {
  projectId: Schema.Int,
  reference: Schema.String,
}) {
  override get message() {
    return `More than one deployment matches the requested reference.`;
  }
}

export class DeployKeyRecoveryRequired extends Schema.TaggedError<
  DeployKeyRecoveryRequired,
  { readonly brand: unique symbol }
>()("DeployKeyRecoveryRequired", {
  deploymentName: Schema.String,
  keyName: Schema.String,
  keyIds: Schema.Array(Schema.Int),
  reason: Schema.Literals([
    "missing saved secret",
    "key not found",
    "key name already exists",
    "issuance uncertain",
    "unverifiable issuance metadata",
    "issued permissions differ",
  ]),
}) {
  override get message(): string {
    switch (this.reason) {
      case "missing saved secret":
        return "Cannot recover the deploy key: missing saved secret. Restore its protected state or provision a replacement.";
      case "key not found":
        return "Tracked deploy key not found in Convex. Verify the deployment and key ID before provisioning a replacement.";
      case "key name already exists":
        return "A matching deploy-key name already exists. Restore its protected state to manage it, or choose a different name for a new key.";
      case "issuance uncertain":
        return "Convex may have issued a deploy key before its secret was saved. Check the deployment's keys and restore the state or revoke the untracked key before provisioning a replacement.";
      case "unverifiable issuance metadata":
        return "The key list did not identify the newly issued deploy key unambiguously. Check for matching key names before retrying.";
      case "issued permissions differ":
        return "The newly issued deploy key did not have the requested permissions. Verify the requested actions and the issuing token's permissions before retrying.";
    }
  }
}

export class DeployKeyChangeRequiresNewResource extends Schema.TaggedError<
  DeployKeyChangeRequiresNewResource,
  { readonly brand: unique symbol }
>()("DeployKeyChangeRequiresNewResource", {
  deploymentName: Schema.String,
  keyId: Schema.Int,
  field: Schema.String,
}) {
  override get message() {
    return `Changing deploy-key ${this.field} requires a separate resource.`;
  }
}

export class ConflictingEnvironmentNames extends Schema.TaggedError<
  ConflictingEnvironmentNames,
  { readonly brand: unique symbol }
>()("ConflictingEnvironmentNames", {
  names: Schema.Tuple([Schema.Literal("Type"), Schema.Literal("FQN")]),
}) {
  override get message() {
    return `Declare Type and FQN on separate environment resources.`;
  }
}

export class ReservedEnvironmentVariableName extends Schema.TaggedError<
  ReservedEnvironmentVariableName,
  { readonly brand: unique symbol }
>()("ReservedEnvironmentVariableName", { variableName: Schema.String }) {
  override get message() {
    return `Cannot manage environment variables: unsafe state key.`;
  }
}

export class UnreadableEnvironmentVariable extends Schema.TaggedError<
  UnreadableEnvironmentVariable,
  { readonly brand: unique symbol }
>()("UnreadableEnvironmentVariable", { variableName: Schema.String }) {
  override get message() {
    return `Cannot manage environment variables: unreadable name.`;
  }
}

export class UnresolvedEnvironmentVariableNames extends Schema.TaggedError<
  UnresolvedEnvironmentVariableNames,
  { readonly brand: unique symbol }
>()("UnresolvedEnvironmentVariableNames", {}) {
  override get message() {
    return `Environment variable names must be known when declaring the resource.`;
  }
}

export class EnvironmentTargetChange extends Schema.TaggedError<
  EnvironmentTargetChange,
  { readonly brand: unique symbol }
>()("EnvironmentTargetChange", { url: Schema.String }) {
  override get message() {
    return `A change of environment target requires a separate resource.`;
  }
}

export class AuthoritativeEnvironmentVariableIdentityChange extends Schema.TaggedError<
  AuthoritativeEnvironmentVariableIdentityChange,
  { readonly brand: unique symbol }
>()("AuthoritativeEnvironmentVariableIdentityChange", {
  field: Schema.Literals(["name", "url"]),
}) {
  override get message() {
    return `A change of variable ${this.field} requires a separate resource.`;
  }
}
