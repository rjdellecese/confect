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
import { createElement } from "react";
import type { ReactNode } from "react";
import { vi } from "vitest";

const Json = Schema.fromJsonString(Schema.Unknown);

class TestSocket extends EventTarget implements WebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = TestSocket.CONNECTING;
  readonly OPEN = TestSocket.OPEN;
  readonly CLOSING = TestSocket.CLOSING;
  readonly CLOSED = TestSocket.CLOSED;
  static current: TestSocket | undefined;
  readonly url: string;
  readonly bufferedAmount = 0;
  readonly extensions = "";
  readonly protocol = "";
  binaryType: BinaryType = "blob";
  readyState: WebSocket["readyState"] = TestSocket.CONNECTING;
  onopen: WebSocket["onopen"] = null;
  onmessage: WebSocket["onmessage"] = null;
  onclose: WebSocket["onclose"] = null;
  onerror: WebSocket["onerror"] = null;
  send = vi.fn<WebSocket["send"]>();

  constructor(url: string | URL) {
    super();
    this.url = String(url);
    TestSocket.current = this;
  }

  open() {
    this.readyState = TestSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  receive(message: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: Result.getOrThrow(Schema.encodeResult(Json)(message)),
      }),
    );
  }

  close() {
    this.readyState = TestSocket.CLOSED;
    this.dispatchEvent(new CloseEvent("close"));
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

const page = (ranks: Array<string>, isDone: boolean) => ({
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

it.effect(
  "native optimistic layers replay over new pages, roll back failures and reconcile success",
  () =>
    Effect.gen(function* () {
      const client = new ConvexReactClient("https://example.convex.cloud", {
        webSocketConstructor: TestSocket,
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
      socket.open();
      const version0 = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
      const version1 = { querySet: 2, identity: 0, ts: "AQAAAAAAAAA=" };
      const version2 = { querySet: 2, identity: 0, ts: "AgAAAAAAAAA=" };
      const version3 = { querySet: 2, identity: 0, ts: "AwAAAAAAAAA=" };
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
        yield* Effect.promise(() =>
          expect(failing).rejects.toThrow("rejected"),
        );
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
