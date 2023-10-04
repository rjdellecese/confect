import {
  FileMetadata,
  StorageId,
  StorageReader,
  StorageWriter,
} from "convex/server";
import { Effect } from "effect";

export interface EffectStorageReader {
  getUrl(storageId: StorageId): Effect.Effect<never, never, string | null>;
  getMetadata(
    storageId: StorageId
  ): Effect.Effect<never, never, FileMetadata | null>;
}

export class EffectStorageReaderImpl implements EffectStorageReader {
  constructor(private storageReader: StorageReader) {}
  getUrl(storageId: string): Effect.Effect<never, never, string | null> {
    return Effect.promise(() => this.storageReader.getUrl(storageId));
  }
  getMetadata(
    storageId: string
  ): Effect.Effect<never, never, FileMetadata | null> {
    return Effect.promise(() => this.storageReader.getMetadata(storageId));
  }
}

export interface EffectStorageWriter extends EffectStorageReader {
  generateUploadUrl(): Effect.Effect<never, never, string>;
  delete(storageId: StorageId): Effect.Effect<never, never, void>;
}

export class EffectStorageWriterImpl implements EffectStorageWriter {
  private effectStorageReader: EffectStorageReader;
  constructor(private storageWriter: StorageWriter) {
    this.effectStorageReader = new EffectStorageReaderImpl(storageWriter);
  }
  getUrl(storageId: string): Effect.Effect<never, never, string | null> {
    return this.effectStorageReader.getUrl(storageId);
  }
  getMetadata(
    storageId: string
  ): Effect.Effect<never, never, FileMetadata | null> {
    return this.effectStorageReader.getMetadata(storageId);
  }
  generateUploadUrl(): Effect.Effect<never, never, string> {
    return Effect.promise(() => this.storageWriter.generateUploadUrl());
  }
  delete(storageId: string): Effect.Effect<never, never, void> {
    return Effect.promise(() => this.storageWriter.delete(storageId));
  }
}
