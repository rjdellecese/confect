import { Schema } from "effect";

//#region src/api/PaginationResult.d.ts
declare namespace PaginationResult_d_exports {
  export { PaginationResult };
}
declare const PaginationResult: <Doc extends Schema.Schema.AnyNoContext>(Doc: Doc) => Schema.Struct<{
  page: Schema.Array$<Doc>;
  isDone: typeof Schema.Boolean;
  continueCursor: typeof Schema.String;
  splitCursor: Schema.optionalWith<Schema.Union<[typeof Schema.String, typeof Schema.Null]>, {
    exact: true;
  }>;
  pageStatus: Schema.optionalWith<Schema.Union<[Schema.Literal<["SplitRecommended"]>, Schema.Literal<["SplitRequired"]>, typeof Schema.Null]>, {
    exact: true;
  }>;
}>;
//#endregion
export { PaginationResult, PaginationResult_d_exports };
//# sourceMappingURL=PaginationResult.d.ts.map