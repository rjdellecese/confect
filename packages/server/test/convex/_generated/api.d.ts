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
  databaseReader: {
    getNote: FunctionReference<
      "query",
      "public",
      { noteId: Id<"notes"> },
      {
        _creationTime: number;
        _id: Id<"notes">;
        author?: { name: string; role: "admin" | "user" };
        embedding?: Array<number>;
        tag?: string;
        text: string;
        userId?: Id<"users">;
      }
    >;
    listNotes: FunctionReference<
      "query",
      "public",
      {},
      Array<{
        _creationTime: number;
        _id: Id<"notes">;
        author?: { name: string; role: "admin" | "user" };
        embedding?: Array<number>;
        tag?: string;
        text: string;
        userId?: Id<"users">;
      }>
    >;
  };
  groups: {
    notes: {
      delete_: FunctionReference<
        "mutation",
        "public",
        { noteId: Id<"notes"> },
        null
      >;
      getFirst: FunctionReference<
        "query",
        "public",
        {},
        | { _tag: "None" }
        | {
            _tag: "Some";
            value: {
              _creationTime: number;
              _id: Id<"notes">;
              author?: { name: string; role: "admin" | "user" };
              embedding?: Array<number>;
              tag?: string;
              text: string;
              userId?: Id<"users">;
            };
          }
      >;
      insert: FunctionReference<
        "mutation",
        "public",
        { text: string },
        Id<"notes">
      >;
      list: FunctionReference<
        "query",
        "public",
        {},
        Array<{
          _creationTime: number;
          _id: Id<"notes">;
          author?: { name: string; role: "admin" | "user" };
          embedding?: Array<number>;
          tag?: string;
          text: string;
          userId?: Id<"users">;
        }>
      >;
    };
    random: {
      getNumber: FunctionReference<"action", "public", {}, number>;
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
export declare const internal: {
  groups: {
    notes: {
      internalGetFirst: FunctionReference<
        "query",
        "internal",
        {},
        | { _tag: "None" }
        | {
            _tag: "Some";
            value: {
              _creationTime: number;
              _id: Id<"notes">;
              author?: { name: string; role: "admin" | "user" };
              embedding?: Array<number>;
              tag?: string;
              text: string;
              userId?: Id<"users">;
            };
          }
      >;
    };
  };
};

export declare const components: {};
