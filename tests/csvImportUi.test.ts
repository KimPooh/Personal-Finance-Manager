import { describe, expect, it } from "vitest";
import { BANK_ROW_PARSE_ERROR_CODES } from "@/lib/bankCsvImport";
import { ERROR_CODE_KEYS, errorMessage, formatFileSize } from "@/lib/csvImportUi";
import type { TFunction } from "@/lib/i18n/t";

const identityT: TFunction = (key) => key;

describe("errorMessage", () => {
  it("ERROR_CODE_KEYS가 실제 BankRowParseErrorCode 전체 목록과 정확히 일치한다", () => {
    const actualCodes = [...BANK_ROW_PARSE_ERROR_CODES].sort();
    const mappedCodes = Object.keys(ERROR_CODE_KEYS).sort();
    expect(mappedCodes).toEqual(actualCodes);
  });

  it("모든 코드가 서로 다른 i18n 키로 매핑된다", () => {
    const codes = Object.keys(ERROR_CODE_KEYS);
    const keys = codes.map((code) => errorMessage(identityT, code));
    expect(new Set(keys).size).toBe(codes.length);
    for (const key of keys) expect(key.startsWith("cashflow.csvImportError")).toBe(true);
  });

  it("알 수 없는 code는 안전한 일반 문구 키로 대체한다", () => {
    expect(errorMessage(identityT, "SOMETHING_NEW")).toBe("cashflow.csvImportErrorUnknown");
  });
});

describe("formatFileSize", () => {
  it("1024바이트 미만은 B 단위로 표시한다", () => {
    expect(formatFileSize(500)).toBe("500B");
    expect(formatFileSize(0)).toBe("0B");
  });

  it("1KB 이상 1MB 미만은 KB 단위로 표시한다", () => {
    expect(formatFileSize(1024)).toBe("1KB");
    expect(formatFileSize(2048)).toBe("2KB");
  });

  it("1MB 이상은 소수점 한 자리 MB 단위로 표시한다", () => {
    expect(formatFileSize(1024 * 1024)).toBe("1.0MB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5MB");
  });
});
