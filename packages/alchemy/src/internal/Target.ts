import * as Str from "effect/String";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export class InvalidTarget extends Schema.TaggedError<
  InvalidTarget,
  { readonly brand: unique symbol }
>()("InvalidTarget", {
  field: Schema.Literals(["deploymentName", "url", "deployKey"]),
}) {
  override get message(): string {
    return `Invalid Convex ${this.field}: use a deployment-specific key and its matching Convex cloud origin.`;
  }
}

const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const hostnameLabel = new RegExp(`^${label}$`, "u");
export const isDeploymentName = (name: string) => hostnameLabel.test(name);
const cloud = new RegExp(
  `^https://(${label})(?:\\.[a-z]{2}(?:-[a-z]+)+-[0-9]+)?\\.convex\\.cloud/?$`,
  "u",
);

export const cloudOrigin = (url: string, expectedName?: string) => {
  const matches = cloud.exec(url);
  if (matches === null || matches[0] !== url)
    return Result.fail(InvalidTarget.make({ field: "url" }));
  if (expectedName !== undefined && expectedName !== matches[1])
    return Result.fail(InvalidTarget.make({ field: "deploymentName" }));
  return Result.succeed(Str.replace(/\/$/u, "")(url));
};

export const usableKey = (deployKey: Redacted.Redacted<string>) =>
  Result.try({
    try: () => Redacted.value(deployKey),
    catch: () => InvalidTarget.make({ field: "deployKey" }),
  }).pipe(
    Result.filterOrFail(
      (value) =>
        typeof value === "string" && value.length > 0 && !/[\s\0]/u.test(value),
      () => InvalidTarget.make({ field: "deployKey" }),
    ),
  );

export const keyFor = (
  deployKey: Redacted.Redacted<string>,
  name: string,
  opaque = false,
) =>
  usableKey(deployKey).pipe(
    Result.flatMap((value) => {
      if (typeof value !== "string")
        return Result.fail(InvalidTarget.make({ field: "deployKey" }));
      const [scope, material, ...extra] = Str.split(value, "|");
      if (
        opaque &&
        (material === undefined || !isDeploymentName(scope)) &&
        !/^(?:project|preview|dev|prod|custom):/u.test(scope)
      )
        return Result.succeed(deployKey);
      return isDeploymentName(name) &&
        [
          name,
          `prod:${name}`,
          `dev:${name}`,
          `custom:${name}`,
          `preview:${name}`,
        ].includes(scope) &&
        material !== undefined &&
        material.length > 0 &&
        (opaque || (extra.length === 0 && !/[\s#'"`\\\0]/u.test(material)))
        ? Result.succeed(deployKey)
        : Result.fail(InvalidTarget.make({ field: "deployKey" }));
    }),
  );

export const authorize = (
  url: string,
  name: string | undefined,
  secret: Redacted.Redacted<string>,
  opaque = false,
) =>
  Result.gen(function* () {
    const origin = yield* cloudOrigin(url, name);
    const deploymentName = Str.split(new URL(origin).hostname, ".")[0];
    yield* keyFor(secret, deploymentName, opaque);
    return { name: deploymentName, url: origin };
  });
