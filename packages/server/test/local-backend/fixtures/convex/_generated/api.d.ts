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
    metadata: {
      actionMetadata: FunctionReference<
        "action",
        "public",
        {},
        {
          deploymentName: string;
          functionName: string;
          functionType: string;
          ip: string | null;
          requestId: string;
          scheduledFunctionId: string | null;
        }
      >;
      mutationMetadata: FunctionReference<
        "mutation",
        "public",
        {},
        {
          deploymentName: string;
          functionName: string;
          functionType: string;
          ip: string | null;
          remainingWrites: number;
          requestId: string;
          scheduledFunctionId: string | null;
        }
      >;
      queryMetadata: FunctionReference<
        "query",
        "public",
        {},
        {
          deploymentName: string;
          functionName: string;
          functionType: string;
          remainingReads: number;
        }
      >;
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
  metadataNode: {
    metadata: FunctionReference<
      "action",
      "public",
      {},
      {
        deploymentName: string;
        functionName: string;
        functionType: string;
        ip: string | null;
        requestId: string;
        scheduledFunctionId: string | null;
      }
    >;
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

export declare const components: {};
