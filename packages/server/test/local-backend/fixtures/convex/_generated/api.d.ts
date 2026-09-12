/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  groups: {
    cacheControl: {
      control: FunctionReference<"query", "public", {}, any>;
    };
    cacheStubbed: {
      confectNoTime: FunctionReference<"query", "public", {}, number>;
      confectWithClock: FunctionReference<"query", "public", {}, number>;
      confectWithLog: FunctionReference<"query", "public", {}, number>;
      confectWithRawDateNow: FunctionReference<"query", "public", {}, number>;
      confectWithSpan: FunctionReference<"query", "public", {}, number>;
    };
    components: {
      exercise: FunctionReference<
        "mutation",
        "public",
        { run: string },
        {
          first: Array<number>;
          left: Array<number>;
          rejectedId: string;
          right: Array<number>;
          second: Array<number>;
        }
      >;
      hasAuth: FunctionReference<"query", "public", {}, boolean>;
      list: FunctionReference<
        "query",
        "public",
        { run: string },
        { first: Array<number>; second: Array<number> }
      >;
      schedule: FunctionReference<
        "mutation",
        "public",
        { run: string },
        string
      >;
      storageUrl: FunctionReference<"query", "public", { id: string }, string>;
      uploadUrl: FunctionReference<"mutation", "public", {}, string>;
    };
    nativeComponents: {
      roundTrip: FunctionReference<"mutation", "public", { run: string }, any>;
    };
    scheduling: {
      manyOpsMutation: FunctionReference<"mutation", "public", {}, number>;
      manyOpsQuery: FunctionReference<"query", "public", {}, number>;
    };
    storage: {
      generateUploadUrl: FunctionReference<"mutation", "public", {}, string>;
      getUrl: FunctionReference<
        "query",
        "public",
        { storageId: Id<"_storage"> },
        string
      >;
    };
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {};

export declare const components: {
  first: import("../../components/counter/convex/_generated/component.js").ComponentApi<"first">;
  second: import("../../components/counter/convex/_generated/component.js").ComponentApi<"second">;
  left: import("../../components/parent/convex/_generated/component.js").ComponentApi<"left">;
  right: import("../../components/parent/convex/_generated/component.js").ComponentApi<"right">;
};
