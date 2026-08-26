import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { parseUploadedRows } from "@/lib/importFile";
import {
  parseBankCsvRows,
  computeFileHash,
  assignOccurrenceIndexes,
  normalizeDescription,
  parseTransactionDate,
  bankCsvOptionsSchema,
  ALLOWED_CSV_EXTENSIONS,
  MAX_CSV_FILE_SIZE_BYTES,
  MAX_CSV_ROWS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TRANSACTION_AMOUNT,
} from "@/lib/bankCsvImport";

// 클라이언트가 보내는 미리보기 결과(해시·지문·occurrenceIndex 등)는 전혀 신뢰하지 않습니다.
// 원본 파일을 다시 받아 서버가 처음부터 다시 파싱하고, 클라이언트는 행별 포함/제외 선택과
// (선택적) 수정값만 보냅니다.
//
// 중복 판정 identity(fileHash/rowFingerprint/occurrenceIndex/transactionDate)는 항상 서버가
// 다시 파싱한 "원본" 값 기준으로 고정합니다 - 사용자가 확인 단계에서 금액·적요 등을 고쳐도
// CsvImportRecord의 identity는 바뀌지 않습니다. occurrenceIndex도 파일 전체의 유효 행을 원래
// 순서대로 놓고 한 번만 계산해서(assignOccurrenceIndexes) 어떤 행을 선택했는지와 무관하게
// 항상 같은 값을 씁니다. 이렇게 해야 (a) 한 행을 수정해서 확정한 뒤 같은 원본 파일을 다시
// 올려도 "같은 파일 중복"으로 정확히 잡히고, (b) 동일 반복 거래 중 일부만 먼저 확정했다가
// 나중에 나머지를 확정해도 occurrenceIndex가 어긋나지 않습니다.
// 사용자가 수정한 type/category/amount/date/description은 CashflowEntry에만 반영됩니다.

const selectionSchema = z.object({
  rowNumber: z.number().int().positive(),
  include: z.boolean(),
  type: z.enum(["INCOME", "FIXED_EXPENSE", "VARIABLE_EXPENSE"]).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  amount: z.number().finite().gt(0, "금액은 0보다 커야 합니다.").max(MAX_TRANSACTION_AMOUNT).optional(),
  transactionDate: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined) return undefined;
      const normalized = parseTransactionDate(value);
      if (!normalized) {
        ctx.addIssue({ code: "custom", message: "실제 존재하는 날짜가 아닙니다." });
        return z.NEVER;
      }
      return normalized;
    }),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
});

const selectionsSchema = z
  .array(selectionSchema)
  .max(MAX_CSV_ROWS)
  .superRefine((items, ctx) => {
    const seen = new Set<number>();
    for (const item of items) {
      if (seen.has(item.rowNumber)) {
        ctx.addIssue({ code: "custom", message: "같은 행을 두 번 이상 선택할 수 없습니다." });
        return;
      }
      seen.add(item.rowNumber);
    }
  });

function getStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  const optionsParsed = bankCsvOptionsSchema.safeParse({
    sourceType: getStringField(formData, "sourceType"),
    sourceLabel: getStringField(formData, "sourceLabel") ?? undefined,
  });
  if (!optionsParsed.success) {
    return NextResponse.json(
      { error: optionsParsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const { sourceType, sourceLabel } = optionsParsed.data;

  const selectionsRaw = getStringField(formData, "selections");
  let selectionsJson: unknown;
  try {
    selectionsJson = selectionsRaw ? JSON.parse(selectionsRaw) : [];
  } catch {
    return NextResponse.json({ error: "선택 항목 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const selectionsParsed = selectionsSchema.safeParse(selectionsJson);
  if (!selectionsParsed.success) {
    return NextResponse.json(
      { error: selectionsParsed.error.issues[0]?.message ?? "선택 항목이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const selections = selectionsParsed.data;

  const name = file.name.toLowerCase();
  const hasAllowedExtension = ALLOWED_CSV_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!hasAllowedExtension) {
    return NextResponse.json(
      { error: "CSV(.csv) 또는 엑셀(.xlsx) 파일만 업로드할 수 있습니다." },
      { status: 400 }
    );
  }
  if (file.size > MAX_CSV_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "파일 크기가 너무 큽니다." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileHash = computeFileHash(buffer);

  let rawRows;
  try {
    rawRows = await parseUploadedRows(file);
  } catch {
    return NextResponse.json(
      { error: "파일을 읽을 수 없습니다. 올바른 CSV 또는 엑셀 파일인지 확인해주세요." },
      { status: 400 }
    );
  }
  if (rawRows.length === 0) {
    return NextResponse.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });
  }
  if (rawRows.length > MAX_CSV_ROWS) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_CSV_ROWS}행까지만 처리할 수 있습니다.` },
      { status: 413 }
    );
  }

  const { rows: parsedRows } = parseBankCsvRows(rawRows, { sourceType });
  const byRowNumber = new Map(parsedRows.map((row) => [row.rowNumber, row]));

  // 파일 전체의 유효 행을 원래 순서대로 놓고 occurrenceIndex를 한 번만 고정한다 - 사용자가
  // 이번 요청에서 어떤 행을 골랐는지와 무관하게 항상 같은 값이어야 한다.
  const originalOccurrenceIndexes = assignOccurrenceIndexes(parsedRows.map((row) => row.rowFingerprint));
  const occurrenceIndexByRowNumber = new Map(
    parsedRows.map((row, i) => [row.rowNumber, originalOccurrenceIndexes[i]])
  );

  // preview 이후 파일이 바뀌었거나, 클라이언트가 오래된/조작된 선택 상태를 보내는 경우를
  // 조용히 무시하지 않고 요청 전체를 거절한다 (include 여부와 무관하게 전부 검사).
  for (const selection of selections) {
    if (!byRowNumber.has(selection.rowNumber)) {
      return NextResponse.json(
        { error: "요청한 행이 이 파일의 내용과 일치하지 않습니다. 미리보기를 다시 시도해주세요." },
        { status: 400 }
      );
    }
  }

  const rowsToSave = selections
    .filter((s) => s.include)
    .map((selection) => {
      const base = byRowNumber.get(selection.rowNumber)!;
      const type = selection.type ?? base.type;
      const category = selection.category ?? base.category;
      const amount = selection.amount ?? base.amount;
      const transactionDate = selection.transactionDate ?? base.transactionDate;
      const description =
        selection.description !== undefined ? normalizeDescription(selection.description) : base.description;
      return {
        // CashflowEntry에 저장할 최종(사용자 확인·수정 반영) 값
        entry: {
          yearMonth: transactionDate.slice(0, 7),
          type,
          category,
          amount,
          description,
        },
        // CsvImportRecord identity - 항상 서버가 재파싱한 원본 값 (사용자 수정과 무관)
        record: {
          rowFingerprint: base.rowFingerprint,
          occurrenceIndex: occurrenceIndexByRowNumber.get(selection.rowNumber)!,
          transactionDate: base.transactionDate,
        },
      };
    });

  // sourceKey를 아직 클라이언트로부터 받지 않으므로(계좌 식별 입력이 없는 1차 UI) 교차 파일
  // 후보를 판정할 신뢰 가능한 신호가 없습니다 - 항상 0입니다.
  const candidateCount = 0;

  let result: { createdCount: number; skippedCount: number };
  try {
    result = await prisma.$transaction(async (tx) => {
      let createdCount = 0;
      let skippedCount = 0;

      for (const row of rowsToSave) {
        const existing = await tx.csvImportRecord.findUnique({
          where: {
            fileHash_rowFingerprint_occurrenceIndex: {
              fileHash,
              rowFingerprint: row.record.rowFingerprint,
              occurrenceIndex: row.record.occurrenceIndex,
            },
          },
        });
        if (existing) {
          skippedCount++;
          continue;
        }

        const entry = await tx.cashflowEntry.create({
          data: {
            yearMonth: row.entry.yearMonth,
            type: row.entry.type,
            category: row.entry.category,
            amount: row.entry.amount,
            memoEnc: encryptOptional(row.entry.description || null),
          },
        });

        await tx.csvImportRecord.create({
          data: {
            fileHash,
            rowFingerprint: row.record.rowFingerprint,
            occurrenceIndex: row.record.occurrenceIndex,
            transactionDate: row.record.transactionDate,
            sourceType,
            sourceLabel: sourceLabel ?? null,
            sourceKey: null,
            cashflowEntryId: entry.id,
          },
        });

        createdCount++;
      }

      return { createdCount, skippedCount };
    });
  } catch {
    // Prisma 오류 객체나 파일 내용을 그대로 노출하지 않는다. 트랜잭션이 실패했으므로
    // createdCount/skippedCount는 (부분적으로 진행됐더라도) 응답에 쓰지 않는다.
    return NextResponse.json({ error: "저장 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ createdCount: result.createdCount, skippedCount: result.skippedCount, candidateCount });
}
