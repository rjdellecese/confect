import type {
	FileMetadata,
	StorageId,
	StorageReader,
	StorageWriter,
} from "convex/server";
import type { GenericId } from "convex/values";
import { Effect } from "effect";

export interface ConfectStorageReader {
	getUrl(storageId: StorageId): Effect.Effect<string | null>;
	getMetadata(storageId: StorageId): Effect.Effect<FileMetadata | null>;
}

export class ConfectStorageReaderImpl implements ConfectStorageReader {
	constructor(private storageReader: StorageReader) {}
	getUrl(storageId: GenericId<"_storage">): Effect.Effect<string | null> {
		return Effect.promise(() => this.storageReader.getUrl(storageId));
	}
	getMetadata(
		storageId: GenericId<"_storage">,
	): Effect.Effect<FileMetadata | null> {
		return Effect.promise(() => this.storageReader.getMetadata(storageId));
	}
}

export interface ConfectStorageWriter extends ConfectStorageReader {
	generateUploadUrl(): Effect.Effect<string>;
	delete(storageId: GenericId<"_storage">): Effect.Effect<void>;
}

export class ConfectStorageWriterImpl implements ConfectStorageWriter {
	private effectStorageReader: ConfectStorageReader;
	constructor(private storageWriter: StorageWriter) {
		this.effectStorageReader = new ConfectStorageReaderImpl(storageWriter);
	}
	getUrl(storageId: StorageId): Effect.Effect<string | null> {
		return this.effectStorageReader.getUrl(storageId);
	}
	getMetadata(storageId: StorageId): Effect.Effect<FileMetadata | null> {
		return this.effectStorageReader.getMetadata(storageId);
	}
	generateUploadUrl(): Effect.Effect<string> {
		return Effect.promise(() => this.storageWriter.generateUploadUrl());
	}
	delete(storageId: StorageId): Effect.Effect<void> {
		return Effect.promise(() => this.storageWriter.delete(storageId));
	}
}
