import { afterEach, describe, expect, it, vi } from "vitest";
import { validateBackupFile, validateBackupDecryptable, type BackupFile } from "@/lib/backup";
import { encryptText } from "@/lib/crypto";

const TEST_KEY = "11".repeat(32);
const OTHER_KEY = "22".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

function minimalBackup(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    assets: [],
    assetHistory: [],
    loans: [],
    cashflowEntries: [],
    netWorthSnapshots: [],
    chatMessages: [],
    profile: null,
    ...overrides,
  };
}

describe("validateBackupFile", () => {
  it("빈 배열로 이루어진 최소 백업을 통과시킨다", () => {
    const result = validateBackupFile(minimalBackup());
    expect(result.ok).toBe(true);
  });

  it("formatVersion이 없으면 거절한다", () => {
    const backup = minimalBackup();
    delete (backup as Record<string, unknown>).formatVersion;
    const result = validateBackupFile(backup);
    expect(result.ok).toBe(false);
  });

  it("formatVersion이 1이 아니면 거절한다", () => {
    const result = validateBackupFile(minimalBackup({ formatVersion: 2 }));
    expect(result.ok).toBe(false);
  });

  it("assets가 배열이 아니면 거절한다", () => {
    const result = validateBackupFile(minimalBackup({ assets: "not-an-array" }));
    expect(result.ok).toBe(false);
  });

  it("필수 필드가 빠진 자산 레코드를 거절한다", () => {
    const result = validateBackupFile(
      minimalBackup({
        assets: [{ id: "a1", category: "DEPOSIT", currentValue: 1000 }], // name, createdAt, updatedAt 누락
      })
    );
    expect(result.ok).toBe(false);
  });

  it("createdAt이 유효한 날짜 문자열이 아니면 거절한다", () => {
    const result = validateBackupFile(
      minimalBackup({
        assets: [
          {
            id: "a1",
            category: "DEPOSIT",
            name: "테스트",
            currentValue: 1000,
            createdAt: "날짜아님",
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
  });

  it("yearMonth 형식이 잘못된 현금흐름 항목을 거절한다", () => {
    const result = validateBackupFile(
      minimalBackup({
        cashflowEntries: [
          {
            id: "c1",
            yearMonth: "2026-13",
            type: "INCOME",
            category: "월급",
            amount: 1000,
            createdAt: new Date().toISOString(),
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
  });

  it("정상적인 전체 백업을 통과시킨다", () => {
    const now = new Date().toISOString();
    const result = validateBackupFile(
      minimalBackup({
        assets: [
          {
            id: "a1",
            category: "DEPOSIT",
            name: "테스트 예금",
            institutionEnc: null,
            currentValue: 5000000,
            acquiredDate: null,
            memoEnc: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
        profile: {
          id: "p1",
          age: 30,
          region: null,
          householdAnnualIncomeManwon: null,
          occupation: null,
          householdType: null,
          maritalStatus: null,
          numberOfChildren: null,
          homeOwnership: null,
        },
      })
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateBackupDecryptable", () => {
  function backupWithMemo(memoEnc: string | null): BackupFile {
    const now = new Date().toISOString();
    return {
      formatVersion: 1,
      assets: [
        {
          id: "a1",
          category: "DEPOSIT",
          name: "테스트",
          institutionEnc: null,
          currentValue: 1000,
          acquiredDate: null,
          memoEnc,
          createdAt: now,
          updatedAt: now,
        },
      ],
      assetHistory: [],
      loans: [],
      cashflowEntries: [],
      netWorthSnapshots: [],
      chatMessages: [],
      profile: null,
    };
  }

  it("같은 키로 암호화된 필드는 통과시킨다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const encrypted = encryptText("정상 메모");
    const result = validateBackupDecryptable(backupWithMemo(encrypted));
    expect(result.ok).toBe(true);
  });

  it("null 필드는 복호화를 시도하지 않고 통과시킨다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const result = validateBackupDecryptable(backupWithMemo(null));
    expect(result.ok).toBe(true);
  });

  it("다른 키로 암호화된 필드는 거절한다", () => {
    vi.stubEnv("ENCRYPTION_KEY", OTHER_KEY);
    const encryptedWithOtherKey = encryptText("다른 키 메모");

    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const result = validateBackupDecryptable(backupWithMemo(encryptedWithOtherKey));
    expect(result.ok).toBe(false);
  });

  it("형식이 깨진 암호문은 거절한다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const result = validateBackupDecryptable(backupWithMemo("이건.암호문이.아님"));
    expect(result.ok).toBe(false);
  });
});
