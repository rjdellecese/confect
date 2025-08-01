/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as confect from "../confect.js";
import type * as ctx from "../ctx.js";
import type * as database from "../database.js";
import type * as http from "../http.js";
import type * as runners from "../runners.js";
import type * as scheduler from "../scheduler.js";
import type * as storage from "../storage.js";
import type * as vector_search from "../vector_search.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  confect: typeof confect;
  ctx: typeof ctx;
  database: typeof database;
  http: typeof http;
  runners: typeof runners;
  scheduler: typeof scheduler;
  storage: typeof storage;
  vector_search: typeof vector_search;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
