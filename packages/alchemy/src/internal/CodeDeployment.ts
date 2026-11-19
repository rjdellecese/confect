import * as Effect from "effect/Effect";
import type { CodeProps } from "../Code.js";
import { CommandRunner } from "./CommandRunner.js";
import { validateTarget } from "./DeploymentTarget.js";

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
