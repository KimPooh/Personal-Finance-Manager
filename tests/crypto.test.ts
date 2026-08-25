import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptOptional, decryptText, encryptOptional, encryptText } from "@/lib/crypto";

const TEST_KEY = "11".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("민감 텍스트 암호화", () => {
  it("AES-256-GCM으로 암호화 후 원문을 복원한다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const encrypted = encryptText("국민은행 메모");

    expect(encrypted).not.toContain("국민은행 메모");
    expect(decryptText(encrypted)).toBe("국민은행 메모");
  });

  it("같은 원문도 매번 다른 IV로 암호화한다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    expect(encryptText("동일 원문")).not.toBe(encryptText("동일 원문"));
  });

  it("암호문 변조를 감지한다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const encrypted = encryptText("변조 금지");
    const [iv, tag, data] = encrypted.split(".");
    const tampered = `${iv}.${tag}.${data.slice(0, -2)}AA`;

    expect(() => decryptText(tampered)).toThrow();
  });

  it("빈 선택값은 저장하지 않는다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    expect(encryptOptional(null)).toBeNull();
    expect(encryptOptional("")).toBeNull();
    expect(decryptOptional(null)).toBeNull();
  });
});
