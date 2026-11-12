import { FunctionSpec, Ref } from "@confect/core";
import { assert, expect, it } from "@effect/vitest";
import { renderHook } from "@testing-library/react";
import {
  insertAtPosition,
  optimisticallyUpdateValueInPaginatedQuery,
  useMutation,
} from "@confect/react";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import * as Result from "effect/Result";
import * as Effect from "effect/Effect";
import * as Array from "effect/Array";
import * as Schema from "effect/Schema";
import { createElement, type ReactNode } from "react";
import { vi } from "vitest";

const Json = Schema.fromJsonString(Schema.Unknown);

class TestSocket {
  static current: TestSocket | undefined;
  onopen: (() => void) | undefined;
  onmessage: ((event: { data: string }) => void) | undefined;
  onclose: (() => void) | undefined;
  send = vi.fn();

  constructor() {
    TestSocket.current = this;
  }

  receive(message: unknown) {
    this.onmessage?.({
      data: Result.getOrThrow(Schema.encodeResult(Json)(message)),
    });
  }

  close() {
    this.onclose?.();
  }
}

const query = Ref.make(
  "notes",
  FunctionSpec.publicPaginatedQuery({
    name: "list",
    args: () => ({ channel: Schema.FiniteFromString }),
    item: () => Schema.Struct({ rank: Schema.FiniteFromString }),
  }),
);
const mutation = Ref.make(
  "notes",
  FunctionSpec.publicMutation({
    name: "insert",
    args: () => ({ rank: Schema.FiniteFromString }),
    returns: () => Schema.Null,
  }),
);

it.effect(
  "native optimistic layers replay over new pages, roll back failures and reconcile success",
  () =>
    Effect.gen(function* () {
      const client = new ConvexReactClient("https://example.convex.cloud", {
        webSocketConstructor: TestSocket as unknown as typeof WebSocket,
        unsavedChangesWarning: false,
        logger: false,
      });
      const functionReference = Ref.getFunctionReference(query);
      const first = client.watchQuery(functionReference, {
        channel: "1",
        paginationOpts: { cursor: null, numItems: 2, id: 1 },
      });
      const second = client.watchQuery(functionReference, {
        channel: "1",
        paginationOpts: { cursor: "next", numItems: 2, id: 1 },
      });
      const unsubscribeFirst = first.onUpdate(vi.fn());
      const unsubscribeSecond = second.onUpdate(vi.fn());
      const socket = TestSocket.current;
      assert(socket !== undefined);
      socket.onopen?.();
      const version0 = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
      const version1 = { querySet: 2, identity: 0, ts: "AQAAAAAAAAA=" };
      const version2 = { querySet: 2, identity: 0, ts: "AgAAAAAAAAA=" };
      const version3 = { querySet: 2, identity: 0, ts: "AwAAAAAAAAA=" };
      const page = (ranks: string[], isDone: boolean) => ({
        page: Array.map(ranks, (rank) => ({ rank })),
        continueCursor: isDone ? "end" : "next",
        isDone,
      });
      const changed = (queryId: number, value: unknown) => ({
        type: "QueryUpdated",
        queryId,
        value,
        logLines: [],
        journal: null,
      });
      socket.receive({
        type: "Transition",
        startVersion: version0,
        endVersion: version1,
        modifications: [
          changed(0, page(["1", "3"], false)),
          changed(1, page(["5"], true)),
        ],
      });
      const hook = renderHook(() => useMutation(mutation), {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(ConvexProvider, { client }, children),
      });
      try {
        const configured = hook.result.current.withOptimisticUpdate(
          (store, args) => {
            insertAtPosition({
              paginatedQuery: query,
              localQueryStore: store,
              argsToMatch: { channel: 1 },
              item: { rank: args.rank },
              sortOrder: "asc",
              sortKeyFromItem: (item) => item.rank,
            });
            optimisticallyUpdateValueInPaginatedQuery(
              store,
              query,
              { channel: 1 },
              (item) => ({ rank: item.rank + 10 }),
            );
          },
        );
        const failing = configured({ rank: 4 });
        const rejected = expect(failing).rejects.toThrow("rejected");
        expect(first.localQueryResult()).toEqual(
          page(["11", "13", "14"], false),
        );
        expect(second.localQueryResult()).toEqual(page(["15"], true));
        expect(socket.send).toHaveBeenCalledWith(
          expect.stringContaining('"rank":"4"'),
        );
        socket.receive({
          type: "Transition",
          startVersion: version1,
          endVersion: version2,
          modifications: [changed(1, page(["5", "7"], true))],
        });
        expect(first.localQueryResult()).toEqual(
          page(["11", "13", "14"], false),
        );
        expect(second.localQueryResult()).toEqual(page(["15", "17"], true));
        socket.receive({
          type: "MutationResponse",
          requestId: 0,
          success: false,
          result: "rejected",
          logLines: [],
        });
        yield* Effect.promise(() => rejected);
        expect(first.localQueryResult()).toEqual(page(["1", "3"], false));
        expect(second.localQueryResult()).toEqual(page(["5", "7"], true));

        const succeeding = configured({ rank: 4 });
        socket.receive({
          type: "MutationResponse",
          requestId: 1,
          success: true,
          result: null,
          ts: version3.ts,
          logLines: [],
        });
        expect(first.localQueryResult()).toEqual(
          page(["11", "13", "14"], false),
        );
        socket.receive({
          type: "Transition",
          startVersion: version2,
          endVersion: version3,
          modifications: [changed(0, page(["1", "3", "4"], false))],
        });
        yield* Effect.promise(() => expect(succeeding).resolves.toBeNull());
        expect(first.localQueryResult()).toEqual(page(["1", "3", "4"], false));
        expect(second.localQueryResult()).toEqual(page(["5", "7"], true));
      } finally {
        hook.unmount();
        unsubscribeFirst();
        unsubscribeSecond();
        yield* Effect.promise(() => client.close());
      }
    }),
);
