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
import { anyApi, componentsGeneric } from "convex/server";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: {
  counter: {
    create: FunctionReference<
      "mutation",
      "public",
      { count: string; run: string },
      Id<"counters">
    >;
    hasAuth: FunctionReference<"query", "public", {}, boolean>;
    list: FunctionReference<
      "query",
      "public",
      { run: string },
      Array<{
        _creationTime: number;
        _id: Id<"counters">;
        count: string;
        run: string;
      }>
    >;
    paginate: FunctionReference<
      "query",
      "public",
      {
        paginationOpts: {
          cursor: string | null;
          endCursor?: string | null;
          id?: number;
          maximumBytesRead?: number;
          maximumRowsRead?: number;
          numItems: number;
        };
        run: string;
      },
      {
        continueCursor: string;
        isDone: boolean;
        page: Array<{
          _creationTime: number;
          _id: Id<"counters">;
          count: string;
          run: string;
        }>;
        pageStatus?: "SplitRecommended" | "SplitRequired" | null;
        splitCursor?: string | null;
      }
    >;
    reject: FunctionReference<"mutation", "public", { run: string }, null>;
    schedule: FunctionReference<
      "mutation",
      "public",
      { count: string; run: string },
      Id<"_scheduled_functions">
    >;
    storageUrl: FunctionReference<
      "query",
      "public",
      { id: Id<"_storage"> },
      string
    >;
    uploadUrl: FunctionReference<"mutation", "public", {}, string>;
  };
} = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: {} = anyApi as any;

export const components = componentsGeneric() as unknown as {};
