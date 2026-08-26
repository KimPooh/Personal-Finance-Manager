import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { parseUploadedRows } from "@/lib/importFile";
import {
  parseBankCsvRows,
  computeFileHash,
  computeRowFingerprint,
  assignOccurrenceIndexes,
  normalizeDescription,
  parseTransactionDate,
  bankCsvOptionsSchema,
  ALLOWED_CSV_EXTENSIONS,
  MAX_CSV_FILE_SIZE_BYTES,
  MAX_CSV_ROWS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TRANSACTION_AMOUNT,
  type ParsedBankRow,
} from "@/lib/bankCsvImport";

// 클라이언트가 보내는 미리보기 결과(해시·지문·occurrenceIndex 등)는 전혀 신뢰하지 않습니다.
// 원본 파일을 다시 받아 서버가 처음부터 다시 파싱하고, 클라이언트는 행별 포함/제외 선택과
// (선택적) 수정값만 보냅니다. 수정값은 Zod로 재검증한 뒤 fingerprint/occurrenceIndex를
// 최종 값 기준으로 다시 계산합니다.

const selectionSchema = z.object({
  rowNumber: z.number().int().positive(),
  include: z.boolean(),
  type: z.enum(["INCOME", "FIXED_EXPENSE", "VARIABLE_EXPENSE"]).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  amount: z.number().finite().min(0).max(MAX_TRANSACTION_AMOUNT).optional(),
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

const selectionsSchema = z.array(selectionSchema).max(MAX_CSV_ROWS);

function getStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" ? value : null;
}

interface FinalRow {
  transactionDate: string;
  yearMonth: string;
  type: ParsedBankRow["type"];
  category: string;
  amount: number;
  description: string;
  rowFingerprint: string;
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

  const includedSelections = selections.filter((s) => s.include && byRowNumber.has(s.rowNumber));

  const finalRows: FinalRow[] = includedSelections.map((selection) => {
    const base = byRowNumber.get(selection.rowNumber) as ParsedBankRow;
    const type = selection.type ?? base.type;
    const category = selection.category ?? base.category;
    const amount = selection.amount ?? base.amount;
    const transactionDate = selection.transactionDate ?? base.transactionDate;
    const description =
      selection.description !== undefined ? normalizeDescription(selection.description) : base.description;
    const signedAmount = type === "INCOME" ? amount : -amount;
    return {
      transactionDate,
      yearMonth: transactionDate.slice(0, 7),
      type,
      category,
      amount,
      description,
      rowFingerprint: computeRowFingerprint(transactionDate, signedAmount, description),
    };
  });

  const occurrenceIndexes = assignOccurrenceIndexes(finalRows.map((r) => r.rowFingerprint));

  let createdCount = 0;
  let skippedCount = 0;
  // sourceKey를 아직 클라이언트로부터 받지 않으므로(계좌 식별 입력이 없는 1차 UI) 교차 파일
  // 후보를 판정할 신뢰 가능한 신호가 없습니다 - 항상 0입니다.
  const candidateCount = 0;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < finalRows.length; i++) {
      const row = finalRows[i];
      const occurrenceIndex = occurrenceIndexes[i];

      const existing = await tx.csvImportRecord.findUnique({
        where: {
          fileHash_rowFingerprint_occurrenceIndex: {
            fileHash,
            rowFingerprint: row.rowFingerprint,
            occurrenceIndex,
          },
        },
      });
      if (existing) {
        skippedCount++;
        continue;
      }

      const entry = await tx.cashflowEntry.create({
        data: {
          yearMonth: row.yearMonth,
          type: row.type,
          category: row.category,
          amount: row.amount,
          memoEnc: encryptOptional(row.description || null),
        },
      });

      await tx.csvImportRecord.create({
        data: {
          fileHash,
          rowFingerprint: row.rowFingerprint,
          occurrenceIndex,
          transactionDate: row.transactionDate,
          sourceType,
          sourceLabel: sourceLabel ?? null,
          sourceKey: null,
          cashflowEntryId: entry.id,
        },
      });

      createdCount++;
    }
  });

  return NextResponse.json({ createdCount, skippedCount, candidateCount });
}
