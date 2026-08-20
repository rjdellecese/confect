import * as Brand from "effect/Brand";

/**
 * A middleware's identifying key, branded so an arbitrary string cannot pose
 * as one: values originate at `MiddlewareSpec.MiddlewareSpec` and flow from
 * there through attachment, the registry, and the CLI's impl validation.
 */
export type MiddlewareKey = string & Brand.Brand<"MiddlewareKey">;

export const make = Brand.nominal<MiddlewareKey>();
