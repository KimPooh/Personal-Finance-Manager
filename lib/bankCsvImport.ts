import crypto from "node:crypto";
import { hmacFingerprint } from "@/lib/crypto";
import { parseAmount, type ParsedRow } from "@/lib/importFile";

// 은행/카드 CSV·엑셀 거래내역을 CashflowEntry 후보로 정규화하는 순수 로직입니다.
// DB·네트워크·파일시스템 접근이 전혀 없고, 이미 파싱된 행(ParsedRow[])만 입력으로 받습니다 —
// 실제 파일 파싱은 lib/importFile.ts가, DB 저장은 (아직 만들지 않은) API 라우트가 담당합니다.

export interface ParsedBankRow {
  transactionDate: string; // "YYYY-MM-DD" (원본 거래일 — CsvImportRecord 보존용, 아직 미구현)
  yearMonth: string; // "YYYY-MM" (기존 CashflowEntry가 쓰는 형식)
  type: "INCOME" | "FIXED_EXPENSE" | "VARIABLE_EXPENSE";
  category: string;
  amount: number; // 항상 양수 — 방향은 type이 담당 (기존 CashflowEntry 관례와 동일)
  description: string; // 정규화된 적요 (트림·공백 정리만, 그 이상의 가공 없음)
  rowFingerprint: string; // HMAC-SHA256(정규화된 날짜+금액+부호+적요)
}

export interface BankRowParseError {
  rowNumber: number; // 1-based, 헤더 다음 첫 데이터 행이 2
  error: string;
}

export interface BankCsvParseResult {
  rows: ParsedBankRow[];
  errors: BankRowParseError[];
}

const DATE_HEADER_ALIASES = ["거래일자", "거래일", "이용일자", "날짜", "date", "transactiondate"];
const DESCRIPTION_HEADER_ALIASES = [
  "적요",
  "내용",
  "거래내용",
  "가맹점명",
  "description",
  "memo",
  "narrative",
];
const DEPOSIT_HEADER_ALIASES = ["입금액", "입금", "credit", "deposit"];
const WITHDRAWAL_HEADER_ALIASES = ["출금액", "출금", "debit", "withdrawal"];
const AMOUNT_HEADER_ALIASES = ["거래금액", "금액", "amount"];

function pickHeaderValue(row: ParsedRow, aliases: string[]): string {
  for (const alias of aliases) {
    const found = Object.keys(row).find((k) => k.toLowerCase() === alias.toLowerCase());
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

/** "2026-08-25" / "2026.08.25" / "2026/08/25" / "20260825" (시각이 붙어도 앞부분만) 형태를 파싱 */
export function parseTransactionDate(raw: string): string | null {
  const trimmed = raw.trim();

  let match = trimmed.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!match) match = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, year, monthRaw, dayRaw] = match;
  const month = monthRaw.padStart(2, "0");
  const day = dayRaw.padStart(2, "0");
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

  return `${year}-${month}-${day}`;
}

/** 적요 문자열의 앞뒤·연속 공백만 정리합니다 (그 외 가공 없음 — 원문 의미를 바꾸지 않기 위함) */
export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

interface SignedAmount {
  amount: number; // 절대값
  isIncome: boolean;
}

/**
 * 입금/출금이 별도 열이면 그걸 우선 사용하고, 없으면 부호가 있는 단일 거래금액 열을 씁니다.
 * 어느 쪽도 유효한 금액을 못 찾으면 null.
 */
function extractSignedAmount(row: ParsedRow): SignedAmount | null {
  const depositRaw = pickHeaderValue(row, DEPOSIT_HEADER_ALIASES);
  const withdrawalRaw = pickHeaderValue(row, WITHDRAWAL_HEADER_ALIASES);

  if (depositRaw) {
    const amount = parseAmount(depositRaw);
    if (amount !== null && amount !== 0) return { amount: Math.abs(amount), isIncome: true };
  }
  if (withdrawalRaw) {
    const amount = parseAmount(withdrawalRaw);
    if (amount !== null && amount !== 0) return { amount: Math.abs(amount), isIncome: false };
  }

  const amountRaw = pickHeaderValue(row, AMOUNT_HEADER_ALIASES);
  if (amountRaw) {
    const amount = parseAmount(amountRaw);
    if (amount !== null && amount !== 0) return { amount: Math.abs(amount), isIncome: amount > 0 };
  }

  return null;
}

// 카테고리 자동 분류: 기존 CashflowEntryForm의 프리셋 라벨과 같은 문자열을 그대로 사용해
// (components/cashflow/CashflowEntryForm.tsx의 PRESET_KEYS), 수동 입력과 같은 카테고리
// 이름 체계를 씁니다. 매칭 실패 시 "미분류"로 남겨 사용자가 미리보기에서 직접 고르게 합니다.
const FIXED_EXPENSE_KEYWORDS: Record<string, string[]> = {
  "월세/관리비": ["관리비", "월세", "임대료"],
  통신비: ["skt", "kt", "lgu+", "lg유플러스", "통신", "휴대폰", "알뜰폰"],
  보험료: ["보험"],
  구독료: ["넷플릭스", "netflix", "유튜브", "youtube", "멜론", "웨이브", "티빙", "구독"],
};
const VARIABLE_EXPENSE_KEYWORDS: Record<string, string[]> = {
  식비: [
    "스타벅스",
    "starbucks",
    "배달의민족",
    "요기요",
    "쿠팡이츠",
    "식당",
    "카페",
    "마트",
    "편의점",
    "cu",
    "gs25",
    "세븐일레븐",
    "이마트",
    "홈플러스",
  ],
  교통비: ["지하철", "버스", "택시", "카카오t", "주유", "톨게이트", "티머니"],
  의료비: ["병원", "약국", "의원", "치과", "한의원"],
};
const INCOME_KEYWORDS: Record<string, string[]> = {
  근로소득: ["급여", "월급"],
  부업소득: ["부업"],
};

function matchKeyword(description: string, dict: Record<string, string[]>): string | null {
  const lower = description.toLowerCase();
  for (const [category, keywords] of Object.entries(dict)) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return category;
  }
  return null;
}

export function classifyTransaction(
  description: string,
  isIncome: boolean
): { type: ParsedBankRow["type"]; category: string } {
  if (isIncome) {
    return { type: "INCOME", category: matchKeyword(description, INCOME_KEYWORDS) ?? "미분류" };
  }
  const fixedMatch = matchKeyword(description, FIXED_EXPENSE_KEYWORDS);
  if (fixedMatch) return { type: "FIXED_EXPENSE", category: fixedMatch };
  const variableMatch = matchKeyword(description, VARIABLE_EXPENSE_KEYWORDS);
  if (variableMatch) return { type: "VARIABLE_EXPENSE", category: variableMatch };
  return { type: "VARIABLE_EXPENSE", category: "미분류" };
}

/** 거래를 유일하게 식별하는 지문 입력을 만듭니다 (날짜·부호 있는 금액·정규화된 적요) */
function buildFingerprintInput(transactionDate: string, signedAmount: number, description: string): string {
  return `${transactionDate}|${signedAmount}|${description}`;
}

export function computeRowFingerprint(
  transactionDate: string,
  signedAmount: number,
  description: string
): string {
  return hmacFingerprint(buildFingerprintInput(transactionDate, signedAmount, description));
}

/** 파일 내용 자체의 해시 — 같은 파일 재업로드 감지용 (민감정보 아님, 일반 SHA-256으로 충분) */
export function computeFileHash(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function parseSingleRow(row: ParsedRow, rowNumber: number): { row: ParsedBankRow } | { error: BankRowParseError } {
  const dateRaw = pickHeaderValue(row, DATE_HEADER_ALIASES);
  if (!dateRaw) {
    return { error: { rowNumber, error: "거래일 열을 찾을 수 없습니다." } };
  }
  const transactionDate = parseTransactionDate(dateRaw);
  if (!transactionDate) {
    return { error: { rowNumber, error: `거래일을 인식할 수 없습니다: "${dateRaw}"` } };
  }

  const signed = extractSignedAmount(row);
  if (!signed) {
    return { error: { rowNumber, error: "입금/출금/거래금액 중 유효한 금액 열을 찾을 수 없습니다." } };
  }

  const descriptionRaw = pickHeaderValue(row, DESCRIPTION_HEADER_ALIASES);
  const description = normalizeDescription(descriptionRaw);

  const { type, category } = classifyTransaction(description, signed.isIncome);
  const signedAmount = signed.isIncome ? signed.amount : -signed.amount;
  const rowFingerprint = computeRowFingerprint(transactionDate, signedAmount, description);

  return {
    row: {
      transactionDate,
      yearMonth: transactionDate.slice(0, 7),
      type,
      category,
      amount: signed.amount,
      description,
      rowFingerprint,
    },
  };
}

/** 파일 하나에 속한 행들을 순서대로 처리합니다. DB나 다른 파일과의 비교는 하지 않습니다. */
export function parseBankCsvRows(rows: readonly ParsedRow[]): BankCsvParseResult {
  const parsed: ParsedBankRow[] = [];
  const errors: BankRowParseError[] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 헤더가 1행이므로 첫 데이터 행은 2
    const result = parseSingleRow(row, rowNumber);
    if ("error" in result) {
      errors.push(result.error);
    } else {
      parsed.push(result.row);
    }
  });

  return { rows: parsed, errors };
}

/**
 * 같은 파일 안에서 동일 rowFingerprint가 몇 번째로 등장했는지(0부터)를 계산합니다.
 * unique(fileHash, rowFingerprint, occurrenceIndex) 제약의 세 번째 값이 됩니다 —
 * 날짜·금액·적요가 완전히 같은 정상 거래가 여러 번 있어도 서로 다른 레코드로 취급됩니다.
 */
export function assignOccurrenceIndexes(fingerprints: readonly string[]): number[] {
  const seenCounts = new Map<string, number>();
  return fingerprints.map((fp) => {
    const count = seenCounts.get(fp) ?? 0;
    seenCounts.set(fp, count + 1);
    return count;
  });
}
