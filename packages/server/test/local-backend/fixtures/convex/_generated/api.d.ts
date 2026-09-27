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
    transactions: {
      limitedRead: FunctionReference<
        "query",
        "public",
        { caseId: string; limit: number },
        Array<string>
      >;
      limitedReadFromMutation: FunctionReference<
        "mutation",
        "public",
        { caseId: string; limit: number },
        Array<string>
      >;
      limitedWrite: FunctionReference<
        "mutation",
        "public",
        { caseId: string; limit: number },
        null
      >;
      rollback: FunctionReference<
        "mutation",
        "public",
        { caseId: string },
        boolean
      >;
      seed: FunctionReference<
        "mutation",
        "public",
        { caseId: string; count: number },
        null
      >;
      staleRead: FunctionReference<
        "mutation",
        "public",
        { caseId: string; stale: boolean },
        Array<string>
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
export declare const internal: {
  groups: {
    transactions: {
      read: FunctionReference<
        "query",
        "internal",
        { caseId: string },
        Array<string>
      >;
      write: FunctionReference<
        "mutation",
        "internal",
        { caseId: string; fail: boolean; value: string },
        null
      >;
    };
  };
};

export declare const components: {};
