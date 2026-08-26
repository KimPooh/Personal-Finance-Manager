import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { decryptOptional } from "@/lib/crypto";

// 이 라우트 테스트는 실제 dev.db를 절대 건드리지 않는다 - tests/backup.integration.test.ts와
// 동일하게 OS 임시 디렉터리에 격리된 SQLite 파일을 만들고, prisma/migrations의 migration.sql을
// better-sqlite3로 직접 적용한다 (Prisma CLI 하위 프로세스 의존성 없음).
const DB_PATH = join(
  tmpdir(),
  `personal-finance-csv-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
);
const ENCRYPTION_KEY = "66".repeat(32);

const dbState = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient }));
const authState = vi.hoisted(() => ({ getAuthedSession: vi.fn() }));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return dbState.prisma;
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthedSession: authState.getAuthedSession,
}));

function cleanupDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const path = DB_PATH + suffix;
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch {
        // Windows 파일 잠금 해제 지연 - 정리 실패가 테스트 결과에 영향을 주지 않도록 무시
      }
    }
  }
}

function applyMigrations() {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const db = new Database(DB_PATH);
  try {
    for (const dir of migrationDirs) {
      const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
      db.exec(sql);
    }
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  try {
    applyMigrations();
    const { PrismaClient } = await import("@/app/generated/prisma/client");
    const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");
    const adapter = new PrismaBetterSqlite3({ url: DB_PATH });
    dbState.prisma = new PrismaClient({ adapter });
  } catch (e) {
    cleanupDbFiles();
    throw e;
  }
});

afterAll(async () => {
  await dbState.prisma?.$disconnect();
  cleanupDbFiles();
});

beforeEach(() => {
  authState.getAuthedSession.mockReset();
  authState.getAuthedSession.mockResolvedValue({ userId: "test-user", username: "tester" });
});

afterEach(async () => {
  await dbState.prisma.csvImportRecord.deleteMany();
  await dbState.prisma.cashflowEntry.deleteMany();
});

function csvFile(content: string, name = "test.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function xlsxFile(headers: string[], rows: string[][], name = "test.xlsx"): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function previewFormData(file: File, fields: Record<string, string> = { sourceType: "BANK" }): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set("file", file);
  return fd;
}

function confirmFormData(
  file: File,
  selections: unknown[],
  fields: Record<string, string> = { sourceType: "BANK" }
): FormData {
  const fd = previewFormData(file, fields);
  fd.set("selections", JSON.stringify(selections));
  return fd;
}

async function callPreview(formData: FormData) {
  const { POST } = await import("@/app/api/cashflow/csv-preview/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/cashflow/csv-preview", {
    method: "POST",
    body: formData,
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

async function callConfirm(formData: FormData) {
  const { POST } = await import("@/app/api/cashflow/csv-confirm/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/cashflow/csv-confirm", {
    method: "POST",
    body: formData,
  });
  const res = await POST(req);
  return { status: res.status, body: await res.json() };
}

const VALID_CSV = ["거래일자,적요,입금액,출금액", "2026-08-01,급여,3000000,", "2026-08-02,스타벅스 강남점,,4500"].join(
  "\n"
);

describe("POST /api/cashflow/csv-preview", () => {
  it("로그인하지 않으면 401을 반환한다", async () => {
    authState.getAuthedSession.mockResolvedValue(null);
    const { status } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    expect(status).toBe(401);
  });

  it("정상 CSV를 미리보기하고 DB에는 아무것도 쓰지 않는다", async () => {
    const { status, body } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(2);
    expect(body.errors).toEqual([]);
    expect(body.rows[0]).toMatchObject({ type: "INCOME", amount: 3_000_000, sameFileDuplicate: false });
    expect(body.rows[1]).toMatchObject({ amount: 4_500, sameFileDuplicate: false });
    expect(await dbState.prisma.csvImportRecord.count()).toBe(0);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("정상 XLSX도 미리보기할 수 있다", async () => {
    const file = await xlsxFile(
      ["거래일자", "적요", "출금액"],
      [["2026-08-03", "이마트", "12000"]]
    );
    const { status, body } = await callPreview(previewFormData(file));
    expect(status).toBe(200);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].amount).toBe(12_000);
  });

  it(".xls 파일은 거절한다", async () => {
    const file = new File(["dummy"], "test.xls", { type: "application/vnd.ms-excel" });
    const { status, body } = await callPreview(previewFormData(file));
    expect(status).toBe(400);
    expect(body.error).toContain(".xlsx");
  });

  it("빈 파일은 거절한다", async () => {
    const file = csvFile("거래일자,적요,출금액\n");
    const { status } = await callPreview(previewFormData(file));
    expect(status).toBe(400);
  });

  it("최대 행 수를 초과하면 413을 반환한다", async () => {
    const { MAX_CSV_ROWS } = await import("@/lib/bankCsvImport");
    const lines = ["거래일자,적요,출금액"];
    for (let i = 0; i < MAX_CSV_ROWS + 1; i++) {
      lines.push(`2026-08-01,거래${i},1000`);
    }
    const { status } = await callPreview(previewFormData(csvFile(lines.join("\n"))));
    expect(status).toBe(413);
  });

  it("행 오류 응답에는 rowNumber와 code만 담기고 원본 값·상세 메시지는 없다", async () => {
    const csv = ["거래일자,적요,출금액", "알수없음,커피,1000"].join("\n");
    const { status, body } = await callPreview(previewFormData(csvFile(csv)));
    expect(status).toBe(200);
    expect(body.errors).toEqual([{ rowNumber: 2, code: "INVALID_DATE" }]);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("알수없음");
    expect(raw).not.toContain("커피");
  });

  it("같은 파일을 이미 가져온 뒤 다시 미리보면 sameFileDuplicate가 true다", async () => {
    const { computeFileHash, parseBankCsvRows } = await import("@/lib/bankCsvImport");
    const { parseUploadedRows } = await import("@/lib/importFile");
    const file = csvFile(VALID_CSV);
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const parsedRows = await parseUploadedRows(csvFile(VALID_CSV));
    const { rows } = parseBankCsvRows(parsedRows, { sourceType: "BANK" });

    await dbState.prisma.cashflowEntry.create({
      data: { id: "existing-cf", yearMonth: "2026-08", type: "INCOME", category: "근로소득", amount: 3_000_000 },
    });
    await dbState.prisma.csvImportRecord.create({
      data: {
        fileHash,
        rowFingerprint: rows[0].rowFingerprint,
        occurrenceIndex: 0,
        transactionDate: rows[0].transactionDate,
        sourceType: "BANK",
        cashflowEntryId: "existing-cf",
      },
    });

    const { body } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    expect(body.rows[0].sameFileDuplicate).toBe(true);
    expect(body.rows[0].previouslyDeleted).toBe(false);
    expect(body.rows[1].sameFileDuplicate).toBe(false);
  });
});

describe("POST /api/cashflow/csv-confirm", () => {
  it("로그인하지 않으면 401을 반환한다", async () => {
    authState.getAuthedSession.mockResolvedValue(null);
    const { status } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }])
    );
    expect(status).toBe(401);
  });

  it("선택한 행만 CashflowEntry와 CsvImportRecord로 같은 트랜잭션에 저장한다", async () => {
    const { status, body } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [
        { rowNumber: 2, include: true },
        { rowNumber: 3, include: false },
      ])
    );
    expect(status).toBe(200);
    expect(body).toEqual({ createdCount: 1, skippedCount: 0, candidateCount: 0 });

    const entries = await dbState.prisma.cashflowEntry.findMany();
    expect(entries).toHaveLength(1);
    expect(entries[0].type).toBe("INCOME");
    expect(entries[0].amount).toBe(3_000_000);
    expect(decryptOptional(entries[0].memoEnc)).toBe("급여");

    const records = await dbState.prisma.csvImportRecord.findMany();
    expect(records).toHaveLength(1);
    expect(records[0].cashflowEntryId).toBe(entries[0].id);
  });

  it("같은 파일을 다시 확정하면 새로 생성되지 않고 skippedCount로 잡힌다", async () => {
    const selections = [{ rowNumber: 2, include: true }];
    await callConfirm(confirmFormData(csvFile(VALID_CSV), selections));
    const { body } = await callConfirm(confirmFormData(csvFile(VALID_CSV), selections));
    expect(body).toEqual({ createdCount: 0, skippedCount: 1, candidateCount: 0 });
    expect(await dbState.prisma.cashflowEntry.count()).toBe(1);
  });

  it("완전히 동일한 거래가 여러 번 있어도 occurrenceIndex로 구분해 모두 생성한다", async () => {
    const csv = ["거래일자,적요,출금액", "2026-08-05,커피,4500", "2026-08-05,커피,4500"].join("\n");
    const { body } = await callConfirm(
      confirmFormData(csvFile(csv), [
        { rowNumber: 2, include: true },
        { rowNumber: 3, include: true },
      ])
    );
    expect(body.createdCount).toBe(2);
    const records = await dbState.prisma.csvImportRecord.findMany({ orderBy: { occurrenceIndex: "asc" } });
    expect(records.map((r) => r.occurrenceIndex)).toEqual([0, 1]);
    expect(new Set(records.map((r) => r.rowFingerprint)).size).toBe(1);
  });

  it("사용자가 삭제한(cashflowEntryId가 null인) 기존 기록과 같은 행은 다시 만들지 않는다", async () => {
    const { computeFileHash, parseBankCsvRows } = await import("@/lib/bankCsvImport");
    const { parseUploadedRows } = await import("@/lib/importFile");
    const file = csvFile(VALID_CSV);
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = computeFileHash(buffer);
    const parsedRows = await parseUploadedRows(csvFile(VALID_CSV));
    const { rows } = parseBankCsvRows(parsedRows, { sourceType: "BANK" });

    await dbState.prisma.csvImportRecord.create({
      data: {
        fileHash,
        rowFingerprint: rows[0].rowFingerprint,
        occurrenceIndex: 0,
        transactionDate: rows[0].transactionDate,
        sourceType: "BANK",
        cashflowEntryId: null,
      },
    });

    const { body } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }])
    );
    expect(body).toEqual({ createdCount: 0, skippedCount: 1, candidateCount: 0 });
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("범위를 벗어난 수정값은 거절되고 아무것도 생성되지 않는다", async () => {
    const { MAX_TRANSACTION_AMOUNT } = await import("@/lib/bankCsvImport");
    const { status, body } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [
        { rowNumber: 2, include: true, amount: MAX_TRANSACTION_AMOUNT + 1 },
      ])
    );
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("수정된 category/amount/description이 반영되어 저장된다", async () => {
    const { body } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [
        {
          rowNumber: 3,
          include: true,
          category: "식비",
          amount: 5_000,
          description: "커피",
        },
      ])
    );
    expect(body.createdCount).toBe(1);
    const entry = await dbState.prisma.cashflowEntry.findFirst();
    expect(entry?.category).toBe("식비");
    expect(entry?.amount).toBe(5_000);
    expect(decryptOptional(entry?.memoEnc)).toBe("커피");
  });
});
