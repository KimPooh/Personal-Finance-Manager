import { describe, expect, it } from "vitest";
import { hasOleCompoundFileSignature } from "@/lib/uploadFile";

describe("hasOleCompoundFileSignature", () => {
  it("detects the OLE container used by password-protected xlsx files", () => {
    expect(
      hasOleCompoundFileSignature(
        new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      )
    ).toBe(true);
  });

  it("does not mistake a normal ZIP-based xlsx for an encrypted file", () => {
    expect(hasOleCompoundFileSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
  });

  it("rejects truncated headers", () => {
    expect(hasOleCompoundFileSignature(new Uint8Array([0xd0, 0xcf, 0x11]))).toBe(false);
  });
});
