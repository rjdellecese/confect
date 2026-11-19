import type { MutationMeta } from "convex/server";
import * as IdScope from "@confect/core/IdScope";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export type { RequestMetadata as Metadata } from "convex/server";

const make = (meta: Pick<MutationMeta, "getRequestMetadata">) => ({
  get: Effect.fn("RequestMetadata.get")(() =>
    Effect.promise(() => meta.getRequestMetadata()),
  ),
});

export class RequestMetadata extends Context.Service<
  RequestMetadata,
  ReturnType<typeof make>
>()("@confect/server/RequestMetadata") {}

export const forScope = <Meta extends Pick<MutationMeta, "getRequestMetadata">>(
  meta: Meta,
  scope: IdScope.IdScope,
) =>
  scope === IdScope.app
    ? meta
    : {
        ...meta,
        getRequestMetadata: () =>
          meta.getRequestMetadata().then((metadata) => ({
            ...metadata,
            authToken: null,
          })),
      };

export const layer = (meta: Pick<MutationMeta, "getRequestMetadata">) =>
  Layer.succeed(RequestMetadata, make(meta));
