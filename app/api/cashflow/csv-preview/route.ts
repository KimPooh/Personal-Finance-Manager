import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { parseUploadedRows } from "@/lib/importFile";
import {
  parseBankCsvRows,
  computeFileHash,
  assignOccurrenceIndexes,
  bankCsvOptionsSchema,
  ALLOWED_CSV_EXTENSIONS,
  MAX_CSV_FILE_SIZE_BYTES,
  MAX_CSV_ROWS,
} from "@/lib/bankCsvImport";

// DB에는 아무것도 쓰지 않습니다 - 업로드한 파일을 파싱해 미리보기 행만 돌려줍니다.
// fileHash/rowFingerprint/occurrenceIndex는 항상 서버가 다시 계산하며, 클라이언트가 보내는
// 값은 신뢰하지 않습니다(애초에 요청에 그런 필드를 받지도 않습니다).

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

  let rows;
  try {
    rows = await parseUploadedRows(file);
  } catch {
    return NextResponse.json(
      { error: "파일을 읽을 수 없습니다. 올바른 CSV 또는 엑셀 파일인지 확인해주세요." },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });
  }
  if (rows.length > MAX_CSV_ROWS) {
    return NextResponse.json(
      { error: `한 번에 최대 ${MAX_CSV_ROWS}행까지만 처리할 수 있습니다.` },
      { status: 413 }
    );
  }

  const { rows: parsedRows, errors } = parseBankCsvRows(rows, { sourceType });
  const occurrenceIndexes = assignOccurrenceIndexes(parsedRows.map((r) => r.rowFingerprint));

  const fingerprints = parsedRows.map((r) => r.rowFingerprint);
  const existing =
    fingerprints.length > 0
      ? await prisma.csvImportRecord.findMany({
          where: { fileHash, rowFingerprint: { in: fingerprints } },
          select: { rowFingerprint: true, occurrenceIndex: true, cashflowEntryId: true },
        })
      : [];

  // sourceKey는 이 라우트가 클라이언트로부터 받지 않으므로(계좌 식별 입력이 없는 1차 UI) 항상
  // null입니다 - 교차 파일 후보 탐지는 신뢰 가능한 sourceKey가 생기기 전까지는 항상 false입니다.
  const previewRows = parsedRows.map((row, i) => {
    const occurrenceIndex = occurrenceIndexes[i];
    const sameFileMatch = existing.find(
      (e) => e.rowFingerprint === row.rowFingerprint && e.occurrenceIndex === occurrenceIndex
    );
    return {
      rowNumber: row.rowNumber,
      transactionDate: row.transactionDate,
      yearMonth: row.yearMonth,
      type: row.type,
      category: row.category,
      amount: row.amount,
      description: row.description,
      occurrenceIndex,
      sameFileDuplicate: Boolean(sameFileMatch),
      previouslyDeleted: Boolean(sameFileMatch) && sameFileMatch?.cashflowEntryId == null,
      crossFileCandidate: false,
      crossFileConfidence: null as "HIGH" | null,
    };
  });

  return NextResponse.json({
    fileHash,
    sourceType,
    sourceLabel: sourceLabel ?? null,
    rows: previewRows,
    // error(원본 값이 섞인 상세 메시지)는 응답에 담지 않고 code만 반환합니다 -
    // 클라이언트는 code를 안전한 문구로 매핑해 보여줍니다.
    errors: errors.map((e) => ({ rowNumber: e.rowNumber, code: e.code })),
  });
}
