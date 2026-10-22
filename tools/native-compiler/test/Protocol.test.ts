import * as Result from "effect/Result";
import { describe, expect, it } from "@effect/vitest";
import * as Protocol from "../src/Protocol";

const created = '{"version":1,"id":2,"tag":"Created","contextId":1}';
const capturedSource =
  '{"version":1,"id":3,"tag":"Capture","buildId":1,"epoch":1,"status":"Succeeded","provisional":true,"sources":[{"path":"/source.ts","namespace":"file","suffix":"","attributes":{},"loader":"ts","resolveDir":"/","sha256":"","originalSha256":"","bytesBase64":""}],"outputs":[],"metafile":"{}","errors":[],"warnings":[]}';
const frame = (text: string) => {
  const body = Buffer.from(text);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
};

describe("Protocol", () => {
  it("decodes a strict response", () => {
    expect(Protocol.decodeResponse(Buffer.from(created))).toEqual(
      Result.succeed({ version: 1, id: 2, tag: "Created", contextId: 1 }),
    );
  });

  it.each([
    ["namespace", ""],
    ["namespace", "unsupported-plugin"],
    ["loader", "css"],
    ["loader", "file"],
    ["loader", "unsupported-loader"],
  ])("rejects unsupported captured source %s %s", (field, value) => {
    const text = capturedSource.replace(
      field === "namespace" ? '"namespace":"file"' : '"loader":"ts"',
      `"${field}":"${value}"`,
    );
    expect(Result.isFailure(Protocol.decodeResponse(Buffer.from(text)))).toBe(
      true,
    );
  });

  it.each(["js", "ts", "jsx", "tsx", "default", "json", "text", "binary"])(
    "accepts native source loader %s in both supported namespaces",
    (loader) => {
      const text = capturedSource.replace(
        '"loader":"ts"',
        `"loader":"${loader}"`,
      );
      expect(Result.isSuccess(Protocol.decodeResponse(Buffer.from(text)))).toBe(
        true,
      );
      expect(
        Result.isSuccess(
          Protocol.decodeResponse(
            Buffer.from(
              text.replace(
                '"namespace":"file"',
                '"namespace":"confect-generated"',
              ),
            ),
          ),
        ),
      ).toBe(true);
    },
  );

  it.each([
    created.replace('"contextId":1', '"contextId":1,"unknown":1'),
    created.replace('"contextId":1', '"contextId":1,"contextId":1'),
    created.replace('"contextId":1', '"contextId":1,"context\\u0049d":1'),
    created.replace('"contextId":1', '"contextId":null'),
    created.replace('"contextId":1', '"contextId":2'),
    created.replace('"version":1', '"version":2'),
    created.replace('"id":2', '"id":0'),
    created.replace('"id":2', '"id":2.5'),
    created.replace('"id":2', '"id":9007199254740992'),
    created.replace('"tag":"Created",', ""),
    created + created,
    created.slice(0, -1) + ",}",
    '{"version":1,',
    "[",
    "null",
    '{"x":' + "[".repeat(130) + "0" + "]".repeat(130) + "}",
  ])("rejects invalid JSON or schema %s", (text) => {
    expect(Result.isFailure(Protocol.decodeResponse(Buffer.from(text)))).toBe(
      true,
    );
  });

  it("rejects duplicate keys inside nested objects", () => {
    const text =
      '{"version":1,"id":0,"tag":"Resolve","buildId":1,"epoch":1,"callbackId":1,"args":{"path":"x","path":"y"},"probe":{}}';
    const result = Protocol.decodeResponse(Buffer.from(text));
    expect(Result.isFailure(result) && result.failure.reason).toBe(
      "Duplicate object key",
    );
  });

  it("rejects invalid UTF-8 instead of replacing bytes", () => {
    const result = Protocol.decodeResponse(Buffer.from([0xc3, 0x28]));
    expect(Result.isFailure(result) && result.failure.operation).toBe("utf8");
  });

  it("reads fragmented and coalesced frames without mutating input", () => {
    const bytes = Buffer.concat([frame(created), frame(created)]);
    const before = Buffer.from(bytes);
    const decoder = new Protocol.FrameDecoder();
    const output: Buffer[] = [];
    for (let index = 0; index < bytes.length; index++) {
      expect(
        Result.isSuccess(
          decoder.push(bytes.subarray(index, index + 1), (value) =>
            output.push(value),
          ),
        ),
      ).toBe(true);
    }
    expect(output.map((value) => value.toString())).toEqual([created, created]);
    expect(bytes).toEqual(before);
    expect(Result.isSuccess(decoder.finish())).toBe(true);
    const coalesced: Buffer[] = [];
    expect(
      Result.isSuccess(
        new Protocol.FrameDecoder().push(bytes, (value) =>
          coalesced.push(value),
        ),
      ),
    ).toBe(true);
    expect(coalesced).toEqual(output);
  });

  it.each([0, Protocol.maxFrameBytes + 1, 0xffffffff])(
    "rejects frame length %s before allocating its body",
    (length) => {
      const header = Buffer.alloc(4);
      header.writeUInt32BE(length);
      const decoder = new Protocol.FrameDecoder();
      expect(
        Result.isFailure(
          decoder.push(header, () => expect.fail("unexpected body")),
        ),
      ).toBe(true);
      expect(
        Result.isFailure(
          decoder.push(frame(created), () =>
            expect.fail("decoder must stay failed"),
          ),
        ),
      ).toBe(true);
    },
  );

  it.each([1, 2, 3, 4, 5, 20])(
    "rejects EOF at partial frame length %s",
    (length) => {
      const decoder = new Protocol.FrameDecoder();
      decoder.push(frame(created).subarray(0, length), () =>
        expect.fail("unexpected body"),
      );
      expect(Result.isFailure(decoder.finish())).toBe(true);
    },
  );

  it("encodes a strict versioned length-prefixed request", () => {
    const encoded = Protocol.encodeRequest({
      version: 1,
      id: 1,
      tag: "Dispose",
    });
    expect(Result.isSuccess(encoded)).toBe(true);
    if (Result.isSuccess(encoded)) {
      expect(encoded.success.readUInt32BE()).toBe(encoded.success.length - 4);
      expect(JSON.parse(encoded.success.subarray(4).toString())).toEqual({
        version: 1,
        id: 1,
        tag: "Dispose",
      });
    }
    expect(
      Result.isFailure(
        Protocol.encodeRequest({ version: 1, id: 0, tag: "Dispose" }),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        Protocol.encodeRequest({
          version: 1,
          id: 1,
          tag: "Create",
          options: {
            root: "x".repeat(Protocol.maxFrameBytes),
            entries: [],
            conditions: [],
            outdir: "/out",
            tsconfigRaw: "{}",
          },
        }),
      ),
    ).toBe(true);
  });
});
