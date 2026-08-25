import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateBackupFile, validateBackupDecryptable, restoreBackup } from "@/lib/backup";
import { encryptText, decryptText } from "@/lib/crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";

// 실제 dev.db는 절대 건드리지 않는다: 매 실행마다 OS 임시 디렉터리(프로젝트 경로의 한글/공백과
// 무관한 절대 경로)에 고유한 SQLite 파일을 만들어 prisma migrate deploy로 스키마를 적용하고,
// 끝나면 파일 자체를 지운다. Prisma CLI와 better-sqlite3 어댑터가 서로 다른 방식으로 경로를
// 해석해 다른 파일을 열지 않도록, 두 쪽 모두 이 절대 경로를 그대로 사용한다.
const DB_PATH = join(tmpdir(), `personal-finance-backup-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
const DATABASE_URL = `file:${DB_PATH}`;
const ENCRYPTION_KEY = "33".repeat(32);

let prisma: PrismaClient;

function cleanupDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = DB_PATH + suffix;
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // Windows 파일 잠금 해제 지연 - 정리 단계 실패가 테스트 결과에 영향을 주지 않도록 무시
      }
    }
  }
}

beforeAll(async () => {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;

  try {
    // npx는 Windows에서 .cmd 셸 래퍼라 execFileSync가 셸 없이 직접 실행할 수 없으므로,
    // prisma CLI의 JS 진입점을 현재 Node 실행 파일로 바로 실행한다 (셸 개입 없음).
    const prismaCli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL },
      stdio: "pipe",
    });

    const { PrismaClient } = await import("@/app/generated/prisma/client");
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url: DB_PATH });
    prisma = new PrismaClient({ adapter });
  } catch (err) {
    cleanupDbFiles();
    if (err && typeof err === "object" && "stdout" in err) {
      const e = err as { message: string; stdout?: Buffer | string; stderr?: Buffer | string };
      throw new Error(
        [
          `백업 통합 테스트 초기화 실패 (DB_PATH=${DB_PATH})`,
          e.message,
          e.stdout ? `--- stdout ---\n${e.stdout.toString()}` : "",
          e.stderr ? `--- stderr ---\n${e.stderr.toString()}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
    throw err;
  }
}, 30000);

afterAll(async () => {
  await prisma?.$disconnect();
  cleanupDbFiles();
});

async function clearAll() {
  await prisma.$transaction([
    prisma.chatMessage.deleteMany(),
    prisma.assetHistory.deleteMany(),
    prisma.cashflowEntry.deleteMany(),
    prisma.netWorthSnapshot.deleteMany(),
    prisma.loan.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.userProfile.deleteMany(),
  ]);
}

describe("백업 왕복 (실제 격리된 SQLite DB, 공유 restoreBackup 사용)", () => {
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

    const [assets, assetHistory, loans, cashflowEntries, netWorthSnapshots, chatMessages, profile] =
      await Promise.all([
        prisma.asset.findMany(),
        prisma.assetHistory.findMany(),
        prisma.loan.findMany(),
        prisma.cashflowEntry.findMany(),
        prisma.netWorthSnapshot.findMany(),
        prisma.chatMessage.findMany(),
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
      restoredProfile,
    ] = await Promise.all([
      prisma.asset.findMany(),
      prisma.assetHistory.findMany(),
      prisma.loan.findMany(),
      prisma.cashflowEntry.findMany(),
      prisma.netWorthSnapshot.findMany(),
      prisma.chatMessage.findMany(),
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

    expect(restoredProfile).not.toBeNull();
    expect(restoredProfile?.age).toBe(35);
    expect(restoredProfile?.region).toBe("서울");

    // 복원 범위 밖의 테이블은 그대로여야 한다.
    const guardUser = await prisma.appUser.findUnique({ where: { id: "user-1" } });
    expect(guardUser?.username).toBe("guard-user");
    const guardPolicy = await prisma.policyProgram.findUnique({ where: { id: "policy-1" } });
    expect(guardPolicy?.title).toBe("가드 정책");
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
});
