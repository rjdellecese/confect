import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { CodeProps } from "../Code";
import { CommandRunner } from "./CommandRunner";

export class InvalidDeploymentTarget extends Schema.TaggedError<InvalidDeploymentTarget>()(
  "InvalidDeploymentTarget",
  { reason: Schema.Literals(["deployment", "deployKey"]) },
) {}

export const deploy = Effect.fn("Code.deploy")(function* (props: CodeProps) {
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(props.deployment.name) ||
    !new RegExp(
      `^https://${props.deployment.name}(?:\\.[a-z]{2}-[a-z]+-[0-9]+)?\\.convex\\.cloud$`,
    ).test(props.deployment.url)
  ) {
    return yield* new InvalidDeploymentTarget({ reason: "deployment" });
  }
  const key =
    /^(?:dev|prod|preview|custom):([a-z0-9]+(?:-[a-z0-9]+)*)\|[a-zA-Z0-9+/=_-]+$/.exec(
      Redacted.value(props.deployKey),
    );
  if (!key || key[1] !== props.deployment.name) {
    return yield* new InvalidDeploymentTarget({ reason: "deployKey" });
  }
  const runner = yield* CommandRunner;
  if (props.prepare) yield* runner.prepare(props.prepare, props.cwd);
  yield* runner.deploy(props.deployKey, props.cwd);
  return { name: props.deployment.name, url: props.deployment.url };
});
