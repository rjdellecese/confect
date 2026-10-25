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
    nativeComponents: {
      roundTrip: FunctionReference<"mutation", "public", { run: string }, any>;
    };
    scheduling: {
      manyOpsMutation: FunctionReference<"mutation", "public", {}, number>;
      manyOpsQuery: FunctionReference<"query", "public", {}, number>;
    };
    storage: {
      deleteBlob: FunctionReference<
        "mutation",
        "public",
        { storageId: Id<"_storage"> },
        null
      >;
      generateUploadUrl: FunctionReference<"mutation", "public", {}, string>;
      get: FunctionReference<
        "action",
        "public",
        { storageId: Id<"_storage"> },
        string
      >;
      getUrl: FunctionReference<
        "query",
        "public",
        { storageId: Id<"_storage"> },
        string
      >;
      store: FunctionReference<
        "action",
        "public",
        { text: string },
        Id<"_storage">
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

export declare const components: {
  first: import("../../components/counter/convex/_generated/component.js").ComponentApi<"first">;
  second: import("../../components/counter/convex/_generated/component.js").ComponentApi<"second">;
  left: import("../../components/parent/convex/_generated/component.js").ComponentApi<"left">;
  right: import("../../components/parent/convex/_generated/component.js").ComponentApi<"right">;
};
