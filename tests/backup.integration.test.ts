import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { validateBackupFile, validateBackupDecryptable } from "@/lib/backup";
import { encryptText, decryptText } from "@/lib/crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";

// 실제 dev.db는 절대 건드리지 않는다: 매 실행마다 고유한 임시 SQLite 파일을 만들어
// prisma migrate deploy로 스키마를 적용하고, 끝나면 파일 자체를 지운다.
// (.tmp-*.db는 .gitignore의 /*.db 패턴에 걸려 커밋되지 않음, 별도 확인 완료)
const DB_PATH = `.tmp-backup-integration-${Date.now()}-${Math.random().toString(36).slice(2)}.db`;
const DATABASE_URL = `file:./${DB_PATH}`;
const ENCRYPTION_KEY = "33".repeat(32);

let prisma: PrismaClient;

beforeAll(async () => {
  process.env.DATABASE_URL = DATABASE_URL;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;

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
}, 30000);

afterAll(async () => {
  await prisma?.$disconnect();
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = DB_PATH + suffix;
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // Windows 파일 잠금 해제 지연 - 테스트 결과에 영향 없는 정리 단계라 실패해도 무시
      }
    }
  }
});

async function seedBaseline() {
  await prisma.asset.create({
    data: {
      id: "baseline-asset-1",
      category: "DEPOSIT",
      name: "기존 자산",
      currentValue: 1_000_000,
      memoEnc: encryptText("기존 메모"),
    },
  });
}

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

// import 라우트(app/api/settings/import/route.ts)와 동일한 트랜잭션 순서를 그대로 재현한다.
async function restoreFromBackup(backup: import("@/lib/backup").BackupFile) {
  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.deleteMany();
    await tx.assetHistory.deleteMany();
    await tx.cashflowEntry.deleteMany();
    await tx.netWorthSnapshot.deleteMany();
    await tx.loan.deleteMany();
    await tx.asset.deleteMany();
    await tx.userProfile.deleteMany();

    for (const a of backup.assets) {
      await tx.asset.create({
        data: {
          id: a.id,
          category: a.category,
          name: a.name,
          institutionEnc: a.institutionEnc ?? null,
          currentValue: a.currentValue,
          acquiredDate: a.acquiredDate ? new Date(a.acquiredDate) : null,
          memoEnc: a.memoEnc ?? null,
          createdAt: new Date(a.createdAt),
          updatedAt: new Date(a.updatedAt),
        },
      });
    }
    for (const c of backup.cashflowEntries) {
      await tx.cashflowEntry.create({
        data: {
          id: c.id,
          yearMonth: c.yearMonth,
          type: c.type,
          category: c.category,
          amount: c.amount,
          memoEnc: c.memoEnc ?? null,
          createdAt: new Date(c.createdAt),
        },
      });
    }
  });
}

describe("백업 왕복 (실제 격리된 SQLite DB)", () => {
  it("내보내기 → 전체 삭제 → 복원 시 데이터가 그대로 돌아온다", async () => {
    await clearAll();
    await seedBaseline();

    const [assets] = await Promise.all([prisma.asset.findMany()]);
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

    await clearAll();
    expect(await prisma.asset.count()).toBe(0);

    await restoreFromBackup(validated.data);

    const restored = await prisma.asset.findMany();
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe("baseline-asset-1");
    expect(restored[0].name).toBe("기존 자산");
    expect(decryptText(restored[0].memoEnc!)).toBe("기존 메모");
  });

  it("복원 트랜잭션 중간에 실패하면 기존 데이터가 그대로 보존된다 (롤백 실측)", async () => {
    await clearAll();
    await seedBaseline();
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

    await expect(restoreFromBackup(validated.data)).rejects.toThrow();

    const after = await prisma.asset.findMany();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe("baseline-asset-1");
    expect(after[0].name).toBe("기존 자산");
  });

  it("다른 ENCRYPTION_KEY로 만든 백업은 DB를 건드리기 전에 거절된다", async () => {
    await clearAll();
    await seedBaseline();
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
