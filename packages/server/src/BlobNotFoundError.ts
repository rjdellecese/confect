import { Schema } from "effect";

export class BlobNotFoundError extends Schema.TaggedErrorClass<BlobNotFoundError>()(
  "BlobNotFoundError",
  {
    id: Schema.String,
  },
) {
  get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
