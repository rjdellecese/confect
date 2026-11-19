import * as Effect from "effect/Effect";
import type { CodeProps } from "../Code";
import { CommandRunner } from "./CommandRunner";
import { validateTarget } from "./DeploymentTarget";

export const deploy = Effect.fn("Code.deploy")(function* (props: CodeProps) {
  yield* Effect.fromResult(
    validateTarget(
      props.deployment.name,
      props.deployment.url,
      props.deployKey,
    ),
  );
  const runner = yield* CommandRunner;
  if (props.prepare !== undefined)
    yield* runner.prepare(props.prepare, props.cwd);
  yield* runner.deploy(props.deployment, props.deployKey, props.cwd);
  return { name: props.deployment.name, url: props.deployment.url };
});
