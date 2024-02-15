import {
  FileMetadata,
  StorageId,
  StorageReader,
  StorageWriter,
} from "convex/server";
import { Effect } from "effect";

export interface EffectStorageReader {
  getUrl(storageId: StorageId): Effect.Effect<string | null>;
  getMetadata(storageId: StorageId): Effect.Effect<FileMetadata | null>;
}

export class EffectStorageReaderImpl implements EffectStorageReader {
  constructor(private storageReader: StorageReader) {}
  getUrl(storageId: string): Effect.Effect<string | null> {
    return Effect.promise(() => this.storageReader.getUrl(storageId));
  }
  getMetadata(storageId: string): Effect.Effect<FileMetadata | null> {
    return Effect.promise(() => this.storageReader.getMetadata(storageId));
  }
}

export interface EffectStorageWriter extends EffectStorageReader {
  generateUploadUrl(): Effect.Effect<string>;
  delete(storageId: StorageId): Effect.Effect<void>;
}

export class EffectStorageWriterImpl implements EffectStorageWriter {
  private effectStorageReader: EffectStorageReader;
  constructor(private storageWriter: StorageWriter) {
    this.effectStorageReader = new EffectStorageReaderImpl(storageWriter);
  }
  getUrl(storageId: string): Effect.Effect<string | null> {
    return this.effectStorageReader.getUrl(storageId);
  }
  getMetadata(storageId: string): Effect.Effect<FileMetadata | null> {
    return this.effectStorageReader.getMetadata(storageId);
  }
  generateUploadUrl(): Effect.Effect<string> {
    return Effect.promise(() => this.storageWriter.generateUploadUrl());
  }
  delete(storageId: string): Effect.Effect<void> {
    return Effect.promise(() => this.storageWriter.delete(storageId));
  }
}
