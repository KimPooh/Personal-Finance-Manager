import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateBackupFile, validateBackupDecryptable, restoreBackup } from "@/lib/backup";
import { encryptText, decryptText } from "@/lib/crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { isPostgresTestDbConfigured, setupIsolatedTestDatabase } from "./helpers/postgresTestDb";

// 실제 운영 DATABASE_URL과 로컬 dev.db는 절대 건드리지 않는다: 매 실행마다 Neon test
// 브랜치(TEST_DATABASE_URL) 안에 임의 이름의 schema를 새로 만들고 그 안에서만 마이그레이션을
// 적용·테스트한다 (tests/helpers/postgresTestDb.ts). TEST_DATABASE_URL/ALLOW_DESTRUCTIVE_DB_TESTS가
// 설정되지 않은 환경(예: 이 저장소를 처음 clone한 상태)에서는 이 테스트 전체를 실패가 아닌
// "스킵"으로 처리한다 - assertSafeTestDatabaseUrl은 실제로 연결을 시도하는 경로에서는 항상
// 호출되므로, 스킵 여부와 무관하게 안전 검사 자체는 우회되지 않는다.
const ENCRYPTION_KEY = "33".repeat(32);
const dbConfigured = isPostgresTestDbConfigured();

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  if (!dbConfigured) return;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;

  const db = await setupIsolatedTestDatabase();
  prisma = db.prisma;
  teardown = db.teardown;
}, 30000);

afterAll(async () => {
  await teardown?.();
});

async function clearAll() {
  await prisma.$transaction([
    prisma.csvImportRecord.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.assetHistory.deleteMany(),
    prisma.cashflowEntry.deleteMany(),
    prisma.netWorthSnapshot.deleteMany(),
    prisma.loan.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.userProfile.deleteMany(),
  ]);
}

describe.skipIf(!dbConfigured)(
  "백업 왕복 (PostgreSQL 격리 schema, 공유 restoreBackup 사용) - TEST_DATABASE_URL 필요",
  () => {
  it("모든 모델을 내보내기 → 전체 삭제 → 복원하면 필드까지 동일하게 돌아온다", async () => {
    await clearAll();

    const assetId = "asset-1";
    await prisma.asset.create({
      data: {
        id: assetId,
        category: "DEPOSIT",
        name: "기존 자산",
        institutionEnc: encryptText("국민은행"),
        currentValue: 1_000_000,
        memoEnc: encryptText("기존 메모"),
      },
    });
    await prisma.assetHistory.create({
      data: {
        id: "history-1",
        assetId,
        value: 900_000,
        recordedAt: new Date("2026-01-01"),
        noteEnc: encryptText("이력 메모"),
      },
    });
    await prisma.loan.create({
      data: {
        id: "loan-1",
        category: "MORTGAGE",
        institutionEnc: encryptText("우리은행"),
        principal: 300_000_000,
        balance: 280_000_000,
        interestRate: 4.2,
        rateType: "VARIABLE",
        repaymentMethod: "EQUAL_PRINCIPAL_INTEREST",
        monthlyPayment: 1_300_000,
        startDate: new Date("2024-01-15"),
        maturityDate: new Date("2054-01-15"),
        memoEnc: encryptText("대출 메모"),
      },
    });
    await prisma.cashflowEntry.create({
      data: {
        id: "cashflow-1",
        yearMonth: "2026-08",
        type: "INCOME",
        category: "월급",
        amount: 3_500_000,
        memoEnc: encryptText("현금흐름 메모"),
      },
    });
    // cashflowEntryId가 있는 기록과 없는(수동 삭제 등으로 연결이 끊긴) 기록을 둘 다 심는다.
    await prisma.csvImportRecord.create({
      data: {
        id: "csv-record-1",
        fileHash: "1".repeat(64),
        rowFingerprint: "f".repeat(64),
        occurrenceIndex: 0,
        transactionDate: "2026-08-25",
        sourceType: "BANK",
        sourceLabel: "국민은행",
        sourceKey: "a".repeat(64),
        cashflowEntryId: "cashflow-1",
      },
    });
    await prisma.csvImportRecord.create({
      data: {
        id: "csv-record-2",
        fileHash: "1".repeat(64),
        rowFingerprint: "e".repeat(64),
        occurrenceIndex: 0,
        transactionDate: "2026-08-20",
        sourceType: "CARD",
        sourceLabel: null,
        sourceKey: null,
        cashflowEntryId: null,
      },
    });
    await prisma.netWorthSnapshot.create({
      data: {
        id: "snapshot-1",
        yearMonth: "2026-08",
        totalAssets: 1_000_000,
        totalLoans: 280_000_000,
        netWorth: -279_000_000,
      },
    });
    await prisma.chatMessage.create({
      data: { id: "chat-1", role: "user", contentEnc: encryptText("상담 메시지") },
    });
    await prisma.userProfile.create({
      data: { id: "profile-1", age: 35, region: "서울", homeOwnership: "NONE" },
    });

    const [
      assets,
      assetHistory,
      loans,
      cashflowEntries,
      netWorthSnapshots,
      chatMessages,
      csvImportRecords,
      profile,
    ] = await Promise.all([
      prisma.asset.findMany(),
      prisma.assetHistory.findMany(),
      prisma.loan.findMany(),
      prisma.cashflowEntry.findMany(),
      prisma.netWorthSnapshot.findMany(),
      prisma.chatMessage.findMany(),
      prisma.csvImportRecord.findMany(),
      prisma.userProfile.findFirst(),
    ]);

    const backup = {
      formatVersion: 1 as const,
      assets: assets.map((a) => ({
        id: a.id,
        category: a.category,
        name: a.name,
        institutionEnc: a.institutionEnc,
        currentValue: a.currentValue,
        acquiredDate: a.acquiredDate ? a.acquiredDate.toISOString() : null,
        memoEnc: a.memoEnc,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      })),
      assetHistory: assetHistory.map((h) => ({
        id: h.id,
        assetId: h.assetId,
        value: h.value,
        recordedAt: h.recordedAt.toISOString(),
        noteEnc: h.noteEnc,
        createdAt: h.createdAt.toISOString(),
      })),
      loans: loans.map((l) => ({
        id: l.id,
        category: l.category,
        institutionEnc: l.institutionEnc,
        principal: l.principal,
        balance: l.balance,
        interestRate: l.interestRate,
        rateType: l.rateType,
        repaymentMethod: l.repaymentMethod,
        monthlyPayment: l.monthlyPayment,
        startDate: l.startDate.toISOString(),
        maturityDate: l.maturityDate.toISOString(),
        rateChangeDate: l.rateChangeDate ? l.rateChangeDate.toISOString() : null,
        memoEnc: l.memoEnc,
        createdAt: l.createdAt.toISOString(),
        updatedAt: l.updatedAt.toISOString(),
      })),
      cashflowEntries: cashflowEntries.map((c) => ({
        id: c.id,
        yearMonth: c.yearMonth,
        type: c.type,
        category: c.category,
        amount: c.amount,
        memoEnc: c.memoEnc,
        createdAt: c.createdAt.toISOString(),
      })),
      netWorthSnapshots: netWorthSnapshots.map((s) => ({
        id: s.id,
        yearMonth: s.yearMonth,
        totalAssets: s.totalAssets,
        totalLoans: s.totalLoans,
        netWorth: s.netWorth,
        recordedAt: s.recordedAt.toISOString(),
      })),
      chatMessages: chatMessages.map((m) => ({
        id: m.id,
        role: m.role,
        contentEnc: m.contentEnc,
        createdAt: m.createdAt.toISOString(),
      })),
      csvImportRecords: csvImportRecords.map((r) => ({
        id: r.id,
        fileHash: r.fileHash,
        rowFingerprint: r.rowFingerprint,
        occurrenceIndex: r.occurrenceIndex,
        transactionDate: r.transactionDate,
        sourceType: r.sourceType,
        sourceLabel: r.sourceLabel,
        sourceKey: r.sourceKey,
        cashflowEntryId: r.cashflowEntryId,
        importedAt: r.importedAt.toISOString(),
      })),
      profile: profile
        ? {
            id: profile.id,
            age: profile.age,
            region: profile.region,
            householdAnnualIncomeManwon: profile.householdAnnualIncomeManwon,
            occupation: profile.occupation,
            householdType: profile.householdType,
            maritalStatus: profile.maritalStatus,
            numberOfChildren: profile.numberOfChildren,
            homeOwnership: profile.homeOwnership,
          }
        : null,
    };

    // 복원 과정에서 건드리면 안 되는 테이블에 표식 데이터를 심어둔다.
    await prisma.appUser.create({
      data: { id: "user-1", username: "guard-user", passwordHash: "guard-hash" },
    });
    await prisma.policyProgram.create({
      data: {
        id: "policy-1",
        slug: "guard-policy",
        title: "가드 정책",
        agency: "테스트기관",
        summary: "요약",
        targetCriteriaJson: "{}",
        benefit: "혜택",
        applicationPeriod: "상시",
        requiredDocuments: "없음",
        officialUrl: "https://example.com",
        sourceName: "테스트",
        verifiedDate: new Date("2026-01-01"),
      },
    });

    const validated = validateBackupFile(backup);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const decryptable = validateBackupDecryptable(validated.data);
    expect(decryptable.ok).toBe(true);

    await clearAll();
    expect(await prisma.asset.count()).toBe(0);

    // import 라우트(app/api/settings/import/route.ts)가 실제로 호출하는 것과 동일한 함수.
    await prisma.$transaction((tx) => restoreBackup(tx, validated.data));

    const [
      restoredAssets,
      restoredHistory,
      restoredLoans,
      restoredCashflow,
      restoredSnapshots,
      restoredChats,
      restoredCsvImportRecords,
      restoredProfile,
    ] = await Promise.all([
      prisma.asset.findMany(),
      prisma.assetHistory.findMany(),
      prisma.loan.findMany(),
      prisma.cashflowEntry.findMany(),
      prisma.netWorthSnapshot.findMany(),
      prisma.chatMessage.findMany(),
      prisma.csvImportRecord.findMany(),
      prisma.userProfile.findFirst(),
    ]);

    expect(restoredAssets).toHaveLength(1);
    expect(restoredAssets[0].id).toBe(assetId);
    expect(restoredAssets[0].name).toBe("기존 자산");
    expect(decryptText(restoredAssets[0].institutionEnc!)).toBe("국민은행");
    expect(decryptText(restoredAssets[0].memoEnc!)).toBe("기존 메모");

    expect(restoredHistory).toHaveLength(1);
    expect(decryptText(restoredHistory[0].noteEnc!)).toBe("이력 메모");

    expect(restoredLoans).toHaveLength(1);
    expect(decryptText(restoredLoans[0].institutionEnc!)).toBe("우리은행");
    expect(decryptText(restoredLoans[0].memoEnc!)).toBe("대출 메모");
    expect(restoredLoans[0].balance).toBe(280_000_000);

    expect(restoredCashflow).toHaveLength(1);
    expect(decryptText(restoredCashflow[0].memoEnc!)).toBe("현금흐름 메모");

    expect(restoredSnapshots).toHaveLength(1);
    expect(restoredSnapshots[0].netWorth).toBe(-279_000_000);

    expect(restoredChats).toHaveLength(1);
    expect(decryptText(restoredChats[0].contentEnc)).toBe("상담 메시지");

    expect(restoredCsvImportRecords).toHaveLength(2);
    const restoredLinked = restoredCsvImportRecords.find((r) => r.id === "csv-record-1");
    const restoredUnlinked = restoredCsvImportRecords.find((r) => r.id === "csv-record-2");
    expect(restoredLinked?.cashflowEntryId).toBe(restoredCashflow[0].id);
    expect(restoredLinked?.sourceType).toBe("BANK");
    expect(restoredLinked?.sourceLabel).toBe("국민은행");
    expect(restoredUnlinked?.cashflowEntryId).toBeNull();
    expect(restoredUnlinked?.sourceType).toBe("CARD");

    expect(restoredProfile).not.toBeNull();
    expect(restoredProfile?.age).toBe(35);
    expect(restoredProfile?.region).toBe("서울");

    // 복원 범위 밖의 테이블은 그대로여야 한다.
    const guardUser = await prisma.appUser.findUnique({ where: { id: "user-1" } });
    expect(guardUser?.username).toBe("guard-user");
    const guardPolicy = await prisma.policyProgram.findUnique({ where: { id: "policy-1" } });
    expect(guardPolicy?.title).toBe("가드 정책");
  });

  it("CashflowEntry를 삭제하면 연결된 CsvImportRecord는 남고 cashflowEntryId만 null이 된다", async () => {
    await clearAll();
    await prisma.cashflowEntry.create({
      data: { id: "cf-1", yearMonth: "2026-08", type: "INCOME", category: "월급", amount: 1000 },
    });
    await prisma.csvImportRecord.create({
      data: {
        id: "csv-1",
        fileHash: "hash-1",
        rowFingerprint: "a".repeat(64),
        occurrenceIndex: 0,
        transactionDate: "2026-08-25",
        sourceType: "BANK",
        cashflowEntryId: "cf-1",
      },
    });

    await prisma.cashflowEntry.delete({ where: { id: "cf-1" } });

    const record = await prisma.csvImportRecord.findUnique({ where: { id: "csv-1" } });
    expect(record).not.toBeNull();
    expect(record?.cashflowEntryId).toBeNull();
  });

  it("동일 fileHash+rowFingerprint+occurrenceIndex 중복 생성은 거절되고, occurrenceIndex가 다르면 허용된다", async () => {
    await clearAll();
    const base = {
      fileHash: "hash-dup",
      rowFingerprint: "b".repeat(64),
      transactionDate: "2026-08-25",
      sourceType: "BANK",
    };
    await prisma.csvImportRecord.create({ data: { id: "dup-1", ...base, occurrenceIndex: 0 } });

    await expect(
      prisma.csvImportRecord.create({ data: { id: "dup-2", ...base, occurrenceIndex: 0 } })
    ).rejects.toThrow();

    await expect(
      prisma.csvImportRecord.create({ data: { id: "dup-3", ...base, occurrenceIndex: 1 } })
    ).resolves.toBeTruthy();

    expect(await prisma.csvImportRecord.count()).toBe(2);
  });

  it("csvImportRecords 필드가 없는 구버전 formatVersion 1 백업도 빈 배열로 검증·복원된다", async () => {
    await clearAll();
    await prisma.asset.create({
      data: { id: "legacy-asset-1", category: "DEPOSIT", name: "레거시 자산", currentValue: 500_000 },
    });

    const legacyBackup = {
      formatVersion: 1 as const,
      assets: [
        {
          id: "legacy-asset-1",
          category: "DEPOSIT",
          name: "레거시 자산",
          institutionEnc: null,
          currentValue: 500_000,
          acquiredDate: null,
          memoEnc: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      assetHistory: [],
      loans: [],
      cashflowEntries: [],
      netWorthSnapshots: [],
      chatMessages: [],
      // csvImportRecords 키 자체가 없음 - 이 백업이 만들어졌을 당시엔 이 필드가 존재하지 않았다.
      profile: null,
    };
    expect(legacyBackup).not.toHaveProperty("csvImportRecords");

    const validated = validateBackupFile(legacyBackup);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    expect(validated.data.csvImportRecords).toEqual([]);

    await clearAll();
    await prisma.$transaction((tx) => restoreBackup(tx, validated.data));

    const assets = await prisma.asset.findMany();
    expect(assets).toHaveLength(1);
    expect(assets[0].name).toBe("레거시 자산");
    expect(await prisma.csvImportRecord.count()).toBe(0);
  });

  it("복원 트랜잭션 중간에 실패하면 기존 데이터가 그대로 보존된다 (롤백 실측)", async () => {
    await clearAll();
    await prisma.asset.create({
      data: { id: "baseline-asset-1", category: "DEPOSIT", name: "기존 자산", currentValue: 1_000_000 },
    });
    const before = await prisma.asset.findMany();
    expect(before).toHaveLength(1);

    const now = new Date().toISOString();
    // 두 자산이 같은 id를 가져 두 번째 create()에서 유니크 제약 위반으로 트랜잭션이 실패하도록 구성
    const brokenBackup = {
      formatVersion: 1 as const,
      assets: [
        {
          id: "dup-id",
          category: "DEPOSIT",
          name: "새 자산 1",
          institutionEnc: null,
          currentValue: 100,
          acquiredDate: null,
          memoEnc: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "dup-id",
          category: "DEPOSIT",
          name: "새 자산 2 (id 충돌)",
          institutionEnc: null,
          currentValue: 200,
          acquiredDate: null,
          memoEnc: null,
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

    const validated = validateBackupFile(brokenBackup);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    await expect(prisma.$transaction((tx) => restoreBackup(tx, validated.data))).rejects.toThrow();

    const after = await prisma.asset.findMany();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("baseline-asset-1");
    expect(after[0].name).toBe("기존 자산");
  });

  it("다른 ENCRYPTION_KEY로 만든 백업은 DB를 건드리기 전에 거절된다", async () => {
    await clearAll();
    await prisma.asset.create({
      data: { id: "baseline-asset-1", category: "DEPOSIT", name: "기존 자산", currentValue: 1_000_000 },
    });
    const before = await prisma.asset.findMany();
    expect(before).toHaveLength(1);

    const ciphertextFromDifferentKey = "AAAAAAAAAAAAAAAAAAA=.BBBBBBBBBBBBBBBBBBBBBBBBBBBB=.Zm9v";
    const now = new Date().toISOString();
    const backup = {
      formatVersion: 1 as const,
      assets: [
        {
          id: "should-not-be-created",
          category: "DEPOSIT",
          name: "복원되면 안 됨",
          institutionEnc: null,
          currentValue: 1,
          acquiredDate: null,
          memoEnc: ciphertextFromDifferentKey,
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

    const validated = validateBackupFile(backup);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const decryptable = validateBackupDecryptable(validated.data);
    expect(decryptable.ok).toBe(false);

    // 사전 검증에서 막혔으므로 실제 복원 로직은 호출하지 않음 - DB는 seed된 상태 그대로여야 한다
    const after = await prisma.asset.findMany();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("baseline-asset-1");
  });
  }
);
