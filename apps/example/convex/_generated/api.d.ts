/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as env from "../env.js";
import type * as http from "../http.js";
import type * as native from "../native.js";
import type * as node_email from "../node/email.js";
import type * as notesAndRandom_notes from "../notesAndRandom/notes.js";
import type * as notesAndRandom_random from "../notesAndRandom/random.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  env: typeof env;
  http: typeof http;
  native: typeof native;
  "node/email": typeof node_email;
  "notesAndRandom/notes": typeof notesAndRandom_notes;
  "notesAndRandom/random": typeof notesAndRandom_random;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
