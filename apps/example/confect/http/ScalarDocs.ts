import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";
import { Api } from "./NotesApi";

/**
 * Serves interactive API documentation for {@link Api}, powered by
 * [Scalar](https://github.com/scalar/scalar).
 */
export const layer = Layer.unwrap(
  Effect.gen(function* () {
    const siteUrl = yield* Effect.orDie(Config.string("CONVEX_SITE_URL"));

    return HttpApiScalar.layer(Api, {
      path: "/path-prefix/docs",
      scalar: { baseServerURL: siteUrl },
    });
  }),
);
