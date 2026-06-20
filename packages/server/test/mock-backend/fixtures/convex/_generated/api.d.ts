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
    paginateNotes: FunctionReference<
      "query",
      "public",
      { cursor: string | null; numItems: number },
      {
        continueCursor: string;
        isDone: boolean;
        page: Array<{
          _creationTime: number;
          _id: Id<"notes">;
          author?: { name: string; role: "admin" | "user" };
          embedding?: Array<number>;
          tag?: string;
          text: string;
          userId?: Id<"users">;
        }>;
        pageStatus?: "SplitRecommended" | "SplitRequired" | null;
        splitCursor?: string | null;
      }
    >;
    paginateNotesWithFilter: FunctionReference<
      "query",
      "public",
      { cursor: string | null; numItems: number; tag: string },
      {
        continueCursor: string;
        isDone: boolean;
        page: Array<{
          _creationTime: number;
          _id: Id<"notes">;
          author?: { name: string; role: "admin" | "user" };
          embedding?: Array<number>;
          tag?: string;
          text: string;
          userId?: Id<"users">;
        }>;
        pageStatus?: "SplitRecommended" | "SplitRequired" | null;
        splitCursor?: string | null;
      }
    >;
  };
  groups: {
    aliasImporter: {
      echo: FunctionReference<"query", "public", {}, string>;
    };
    cjsImporter: {
      now: FunctionReference<"query", "public", {}, string>;
    };
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
      stats: {
        count: FunctionReference<"query", "public", {}, number>;
      };
    };
    runners: {
      countNotesViaRunner: FunctionReference<"action", "public", {}, number>;
      getNumberViaRunner: FunctionReference<"action", "public", {}, number>;
      insertNoteViaRunner: FunctionReference<
        "action",
        "public",
        { text: string },
        Id<"notes">
      >;
    };
    typedErrors: {
      deleteNoteOrFail: FunctionReference<
        "mutation",
        "public",
        { asAdmin: boolean; noteId: Id<"notes"> },
        null
      >;
      failingAction: FunctionReference<
        "action",
        "public",
        { kind: "notFound" | "forbidden" },
        null
      >;
      getNoteOrFail: FunctionReference<
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
      insertThenFail: FunctionReference<
        "mutation",
        "public",
        { text: string },
        null
      >;
      tryDeleteNote: FunctionReference<
        "action",
        "public",
        { asAdmin: boolean; noteId: Id<"notes"> },
        | { _tag: "Ok" }
        | { _tag: "NotFound"; id: string }
        | { _tag: "Forbidden"; reason: string }
      >;
      tryFailingAction: FunctionReference<
        "action",
        "public",
        { kind: "notFound" | "forbidden" },
        { _tag: "NotFound"; id: string } | { _tag: "Forbidden"; reason: string }
      >;
      tryGetNote: FunctionReference<
        "query",
        "public",
        { noteId: Id<"notes"> },
        { _tag: "Ok"; text: string } | { _tag: "NotFound"; id: string }
      >;
      tryInternalGetNote: FunctionReference<
        "action",
        "public",
        { noteId: Id<"notes"> },
        { _tag: "Ok"; text: string } | { _tag: "NotFound"; id: string }
      >;
    };
  };
  typedErrorsNode: {
    failingNodeAction: FunctionReference<
      "action",
      "public",
      { id: string },
      null
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
    typedErrors: {
      internalGetNoteOrFail: FunctionReference<
        "query",
        "internal",
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
    };
  };
};

export declare const components: {};
