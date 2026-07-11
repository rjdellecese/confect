import * as Schema from "effect/Schema";

export class BlobNotFoundError extends Schema.TaggedErrorClass<BlobNotFoundError>()(
  "BlobNotFoundError",
  {
    id: Schema.String,
  },
) {
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
