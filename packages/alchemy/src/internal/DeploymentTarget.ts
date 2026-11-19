import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export class InvalidDeploymentTarget extends Schema.TaggedError<
  InvalidDeploymentTarget,
  { readonly brand: unique symbol }
>()("InvalidDeploymentTarget", {
  reason: Schema.Literals(["deployment", "deployKey"]),
}) {}

export const validateTarget = (
  name: string,
  url: string,
  deployKey: Redacted.Redacted<string>,
) => {
  const host =
    /^https:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(?:eu-west-1|ap-southeast-2|ca-central-1))?\.convex\.cloud$/.exec(
      url,
    );
  if (host === null || host[1] !== name)
    return Result.fail(InvalidDeploymentTarget.make({ reason: "deployment" }));
  const key =
    /^(?:dev|prod|preview|custom):([a-z0-9]+(?:-[a-z0-9]+)*)\|[a-zA-Z0-9+/=_-]+$/.exec(
      Redacted.value(deployKey),
    );
  if (key === null || key[1] !== name)
    return Result.fail(InvalidDeploymentTarget.make({ reason: "deployKey" }));
  return Result.succeed(undefined);
};
