import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { decryptOptional } from "@/lib/crypto";
import {
  isPostgresTestDbConfigured,
  runScopedRawStatements,
  setupIsolatedTestDatabase,
} from "./helpers/postgresTestDb";

// 이 라우트 테스트는 실제 운영 DATABASE_URL과 로컬 dev.db를 절대 건드리지 않는다 -
// tests/backup.integration.test.ts와 동일하게 Neon test 브랜치 안에 임의 schema를 새로
// 만들고 그 안에서만 마이그레이션을 적용·테스트한다 (tests/helpers/postgresTestDb.ts).
// TEST_DATABASE_URL 자체가 없는 환경에서만 스킵 처리한다 - URL은 있는데
// ALLOW_DESTRUCTIVE_DB_TESTS가 없거나 잘못된 경우는 beforeAll에서 fail-closed로 실패한다.
const ENCRYPTION_KEY = "66".repeat(32);
const dbConfigured = isPostgresTestDbConfigured();

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

let teardown: () => Promise<void>;
let schemaName: string;

beforeAll(async () => {
  if (!dbConfigured) return;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  const db = await setupIsolatedTestDatabase();
  dbState.prisma = db.prisma;
  schemaName = db.schemaName;
  teardown = db.teardown;
});

afterAll(async () => {
  await teardown?.();
});

beforeEach(() => {
  authState.getAuthedSession.mockReset();
  authState.getAuthedSession.mockResolvedValue({ userId: "test-user", username: "tester" });
});

afterEach(async () => {
  if (!dbConfigured) return;
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

/** previewToken을 명시적으로 지정해 confirm용 FormData를 만든다 (변조/불일치 테스트용) */
function confirmFormDataWithToken(
  file: File,
  selections: unknown[],
  previewToken: string,
  fields: Record<string, string> = { sourceType: "BANK" }
): FormData {
  const fd = previewFormData(file, fields);
  fd.set("selections", JSON.stringify(selections));
  fd.set("previewToken", previewToken);
  return fd;
}

/** 실제 csv-preview가 계산하는 것과 동일한 방식으로 유효한 previewToken을 계산해 붙인다 */
async function confirmFormData(
  file: File,
  selections: unknown[],
  fields: Record<string, string> = { sourceType: "BANK" }
): Promise<FormData> {
  const { computeFileHash, computePreviewToken } = await import("@/lib/bankCsvImport");
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = computeFileHash(buffer);
  const sourceType = (fields.sourceType ?? "BANK") as "BANK" | "CARD";
  const sourceLabel = fields.sourceLabel ?? null;
  return confirmFormDataWithToken(file, selections, computePreviewToken(fileHash, sourceType, sourceLabel), fields);
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

async function callConfirm(formDataOrPromise: FormData | Promise<FormData>) {
  const formData = await formDataOrPromise;
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

describe.skipIf(!dbConfigured)("POST /api/cashflow/csv-preview", () => {
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

describe.skipIf(!dbConfigured)("POST /api/cashflow/csv-confirm", () => {
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

  it("amount를 0으로 수정하면 400이고 아무것도 생성되지 않는다", async () => {
    const { status } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [{ rowNumber: 2, include: true, amount: 0 }])
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("같은 rowNumber를 두 번 이상 보내면 400이고 DB가 바뀌지 않는다", async () => {
    const { status } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [
        { rowNumber: 2, include: true },
        { rowNumber: 2, include: false },
      ])
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
    expect(await dbState.prisma.csvImportRecord.count()).toBe(0);
  });

  it("파일에 없는 rowNumber를 보내면 400이고 DB가 바뀌지 않는다", async () => {
    const { status, body } = await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [{ rowNumber: 999, include: true }])
    );
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
    expect(await dbState.prisma.csvImportRecord.count()).toBe(0);
  });

  it("행을 수정해 확정한 뒤 같은 원본 파일을 다시 올리면 원본 identity 기준으로 sameFileDuplicate=true다", async () => {
    await callConfirm(
      confirmFormData(csvFile(VALID_CSV), [
        { rowNumber: 3, include: true, amount: 9_999, description: "수정됨", category: "식비" },
      ])
    );
    const { body } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    expect(body.rows[1].sameFileDuplicate).toBe(true);
  });

  it("동일 반복 거래 중 일부만 먼저 확정해도 파일 전체 기준 occurrenceIndex가 유지된다", async () => {
    const csv = [
      "거래일자,적요,출금액",
      "2026-08-10,커피,4500",
      "2026-08-10,커피,4500",
      "2026-08-10,커피,4500",
    ].join("\n");

    // 3건 중 가운데(rowNumber 3, 파일 전체 기준 두 번째 등장)만 먼저 확정한다.
    const first = await callConfirm(confirmFormData(csvFile(csv), [{ rowNumber: 3, include: true }]));
    expect(first.body.createdCount).toBe(1);
    let records = await dbState.prisma.csvImportRecord.findMany();
    expect(records).toHaveLength(1);
    expect(records[0].occurrenceIndex).toBe(1);

    // 나머지 두 건(rowNumber 2, 4)을 나중에 확정한다.
    const second = await callConfirm(
      confirmFormData(csvFile(csv), [
        { rowNumber: 2, include: true },
        { rowNumber: 4, include: true },
      ])
    );
    expect(second.body.createdCount).toBe(2);
    expect(second.body.skippedCount).toBe(0);

    records = await dbState.prisma.csvImportRecord.findMany({ orderBy: { occurrenceIndex: "asc" } });
    expect(records.map((r) => r.occurrenceIndex)).toEqual([0, 1, 2]);
    expect(records).toHaveLength(3);
    expect(new Set(records.map((r) => r.rowFingerprint)).size).toBe(1);
  });

  it("두 번째 CsvImportRecord INSERT가 실패하면 트랜잭션 전체가 실제로 롤백되고 500을 반환한다", async () => {
    const csv = ["거래일자,적요,출금액", "2026-08-11,행1,1000", "2026-08-12,행2,2000"].join("\n");
    const { parseBankCsvRows } = await import("@/lib/bankCsvImport");
    const { parseUploadedRows } = await import("@/lib/importFile");
    const parsedRows = await parseUploadedRows(csvFile(csv));
    const { rows } = parseBankCsvRows(parsedRows, { sourceType: "BANK" });
    const targetFingerprint = rows[1].rowFingerprint;
    expect(targetFingerprint).toMatch(/^[0-9a-f]{64}$/);

    // PostgreSQL plpgsql 트리거로 두 번째 행의 INSERT만 강제로 실패시켜, 트랜잭션
    // 전체 롤백을 검증한다 (SQLite의 CREATE TRIGGER ... RAISE(ABORT, ...) 방언을
    // plpgsql 함수 + BEFORE INSERT 트리거로 대체). schema 옵션은 raw SQL에 적용되지
    // 않으므로 runScopedRawStatements로 SET LOCAL search_path 트랜잭션 안에서 생성해
    // 격리된 테스트 schema 밖(특히 public)에 함수/트리거가 생기는 경로를 차단한다.
    await runScopedRawStatements(dbState.prisma, schemaName, [
      `CREATE OR REPLACE FUNCTION force_fail_second_row() RETURNS TRIGGER AS $BODY$
      BEGIN
        IF NEW."rowFingerprint" = '${targetFingerprint}' THEN
          RAISE EXCEPTION 'forced test failure';
        END IF;
        RETURN NEW;
      END;
      $BODY$ LANGUAGE plpgsql`,
      `CREATE TRIGGER force_fail_second_row
      BEFORE INSERT ON "CsvImportRecord"
      FOR EACH ROW EXECUTE FUNCTION force_fail_second_row()`,
    ]);

    try {
      const { status, body } = await callConfirm(
        confirmFormData(csvFile(csv), [
          { rowNumber: 2, include: true },
          { rowNumber: 3, include: true },
        ])
      );
      expect(status).toBe(500);
      expect(body.error).toBeTruthy();
      const raw = JSON.stringify(body);
      expect(raw).not.toMatch(/prisma|sqlite|postgres|plpgsql|RAISE|ABORT|EXCEPTION/i);
      expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
      expect(await dbState.prisma.csvImportRecord.count()).toBe(0);
    } finally {
      await runScopedRawStatements(dbState.prisma, schemaName, [
        `DROP TRIGGER IF EXISTS force_fail_second_row ON "CsvImportRecord"`,
        `DROP FUNCTION IF EXISTS force_fail_second_row()`,
      ]);
    }
  });
});

describe.skipIf(!dbConfigured)("csv-confirm previewToken 검증", () => {
  it("실제 preview 응답의 previewToken으로 confirm이 성공한다", async () => {
    const { body: previewBody } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    expect(previewBody.previewToken).toMatch(/^[0-9a-f]{64}$/);

    const { status, body } = await callConfirm(
      confirmFormDataWithToken(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }], previewBody.previewToken)
    );
    expect(status).toBe(200);
    expect(body.createdCount).toBe(1);
  });

  it("다른 파일에서 계산된 토큰으로는 confirm이 거절되고 DB가 바뀌지 않는다", async () => {
    // 행 번호 구성은 VALID_CSV와 동일하지만 내용이 다른 파일 - fileHash가 다르므로 토큰도 달라진다.
    const otherCsv = ["거래일자,적요,입금액,출금액", "2026-08-09,다른 급여,3000000,", "2026-08-10,다른 결제,,4500"].join(
      "\n"
    );
    const { computeFileHash, computePreviewToken } = await import("@/lib/bankCsvImport");
    const otherBuffer = Buffer.from(await csvFile(otherCsv).arrayBuffer());
    const tokenFromOtherFile = computePreviewToken(computeFileHash(otherBuffer), "BANK", null);

    const { status, body } = await callConfirm(
      confirmFormDataWithToken(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }], tokenFromOtherFile)
    );
    expect(status).toBe(400);
    expect(body.error).toBe("미리보기와 파일 또는 설정이 일치하지 않습니다. 다시 미리보기 해주세요.");
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
    expect(await dbState.prisma.csvImportRecord.count()).toBe(0);
  });

  it("같은 파일이라도 preview 때와 sourceType이 다르면 거절된다", async () => {
    const { body: previewBody } = await callPreview(
      previewFormData(csvFile(VALID_CSV), { sourceType: "BANK" })
    );
    const { status } = await callConfirm(
      confirmFormDataWithToken(
        csvFile(VALID_CSV),
        [{ rowNumber: 2, include: true }],
        previewBody.previewToken,
        { sourceType: "CARD" }
      )
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("같은 파일이라도 preview 때와 sourceLabel이 다르면 거절된다", async () => {
    const { body: previewBody } = await callPreview(
      previewFormData(csvFile(VALID_CSV), { sourceType: "BANK", sourceLabel: "국민은행" })
    );
    const { status } = await callConfirm(
      confirmFormDataWithToken(
        csvFile(VALID_CSV),
        [{ rowNumber: 2, include: true }],
        previewBody.previewToken,
        { sourceType: "BANK", sourceLabel: "신한은행" }
      )
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("previewToken이 없으면 400이고 DB가 바뀌지 않는다", async () => {
    const fd = previewFormData(csvFile(VALID_CSV));
    fd.set("selections", JSON.stringify([{ rowNumber: 2, include: true }]));
    const { status } = await callConfirm(fd);
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("previewToken 형식이 잘못되면 400이다 (64자리 hex 아님)", async () => {
    const { status } = await callConfirm(
      confirmFormDataWithToken(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }], "not-a-valid-token")
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("한 글자만 변조된 previewToken도 거절된다", async () => {
    const { body: previewBody } = await callPreview(previewFormData(csvFile(VALID_CSV)));
    const original: string = previewBody.previewToken;
    const flippedChar = original[0] === "a" ? "b" : "a";
    const tampered = flippedChar + original.slice(1);

    const { status } = await callConfirm(
      confirmFormDataWithToken(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }], tampered)
    );
    expect(status).toBe(400);
    expect(await dbState.prisma.cashflowEntry.count()).toBe(0);
  });

  it("토큰 오류 응답에 ENCRYPTION_KEY·파일 내용·적요가 노출되지 않는다", async () => {
    const { body } = await callConfirm(
      confirmFormDataWithToken(csvFile(VALID_CSV), [{ rowNumber: 2, include: true }], "0".repeat(64))
    );
    const raw = JSON.stringify(body);
    expect(raw).not.toContain(ENCRYPTION_KEY);
    expect(raw).not.toContain("급여");
    expect(raw).not.toContain("스타벅스");
  });
});
