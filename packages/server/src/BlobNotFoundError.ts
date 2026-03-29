import { Schema } from "effect";

export class BlobNotFoundError extends Schema.TaggedError<BlobNotFoundError>()(
  "BlobNotFoundError",
  {
    id: Schema.String,
  },
) {
  override get message(): string {
    return `File with ID '${this.id}' not found`;
  }
}
