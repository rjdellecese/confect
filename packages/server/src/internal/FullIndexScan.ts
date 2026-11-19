import type { DocumentDecodeError } from "../Document";
import type { OrderedQuery } from "../OrderedQuery";
import type { QueryStream } from "../QueryStream";
import type { QueryStreamKeyLabels } from "../QueryStreamKeyLabels";
import type { QueryStreamOrderDirection } from "../QueryStreamOrderDirection";
import type { AnyWithProps as TableInfo } from "../TableInfo";

export interface FullIndexScan<
  Info extends TableInfo,
  Doc,
  StreamIndex extends keyof Info["indexes"] & string = keyof Info["indexes"] &
    string,
> {
  readonly index: <Index extends keyof Info["indexes"]>(
    indexName: Index,
    order?: QueryStreamOrderDirection,
  ) => OrderedQuery<Info, Doc>;
  readonly stream: {
    <Index extends StreamIndex>(
      indexName: Index,
    ): QueryStream<
      Doc,
      QueryStreamKeyLabels<Info["indexes"][Index]>,
      "asc",
      DocumentDecodeError,
      never
    >;
    <Index extends StreamIndex, Direction extends QueryStreamOrderDirection>(
      indexName: Index,
      order: Direction,
    ): QueryStream<
      Doc,
      QueryStreamKeyLabels<Info["indexes"][Index]>,
      Direction,
      DocumentDecodeError,
      never
    >;
  };
}
