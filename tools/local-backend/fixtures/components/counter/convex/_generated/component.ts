/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    counter: {
      create: FunctionReference<
        "mutation",
        "internal",
        { count: string; run: string },
        string,
        Name
      >;
      hasAuth: FunctionReference<"query", "internal", {}, boolean, Name>;
      list: FunctionReference<
        "query",
        "internal",
        { run: string },
        Array<{
          _creationTime: number;
          _id: string;
          count: string;
          run: string;
        }>,
        Name
      >;
      reject: FunctionReference<
        "mutation",
        "internal",
        { run: string },
        null,
        Name
      >;
      schedule: FunctionReference<
        "mutation",
        "internal",
        { count: string; run: string },
        string,
        Name
      >;
      storageUrl: FunctionReference<
        "query",
        "internal",
        { id: string },
        string,
        Name
      >;
      uploadUrl: FunctionReference<"mutation", "internal", {}, string, Name>;
    };
  };
