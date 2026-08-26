import crypto from "node:crypto";
import { z } from "zod";
import { hmacFingerprint } from "@/lib/crypto";
import { parseAmount, type ParsedRow } from "@/lib/importFile";

// 은행/카드 CSV·엑셀 거래내역을 CashflowEntry 후보로 정규화하는 순수 로직입니다.
// DB·네트워크·파일시스템 접근이 전혀 없고, 이미 파싱된 행(ParsedRow[])만 입력으로 받습니다 —
// 실제 파일 파싱은 lib/importFile.ts가, DB 저장은 app/api/cashflow/csv-preview·csv-confirm이
// 담당합니다.

export type BankCsvSourceType = "BANK" | "CARD";

export interface ParseBankCsvOptions {
  /**
   * 카드/은행 종류를 헤더만으로 구분할 수 없을 때(부호 있는 단일 금액 열만 있는 경우)의
   * 방향 판정 기준. 카드 고유 열(이용금액/승인금액)이 있으면 이 옵션과 무관하게 항상
   * 지출로 처리하므로, 대부분의 실제 카드 CSV는 옵션 없이도 안전합니다.
   */
  sourceType?: BankCsvSourceType;
}

export interface ParsedBankRow {
  rowNumber: number; // 원본 파일에서의 1-based 행 번호 (헤더가 1행, 첫 데이터 행이 2)
  transactionDate: string; // "YYYY-MM-DD" (원본 거래일 — CsvImportRecord 보존용)
  yearMonth: string; // "YYYY-MM" (기존 CashflowEntry가 쓰는 형식)
  type: "INCOME" | "FIXED_EXPENSE" | "VARIABLE_EXPENSE";
  category: string;
  amount: number; // 항상 양수 — 방향은 type이 담당 (기존 CashflowEntry 관례와 동일)
  description: string; // 정규화된 적요 (트림·공백 정리만, 그 이상의 가공 없음)
  rowFingerprint: string; // HMAC-SHA256(정규화된 날짜+부호있는금액+적요)
}

// API 응답에서 안전하게 노출할 수 있는 오류 분류. error(사람이 읽는 상세 메시지)는 일부
// 원본 값(날짜·금액 등)을 그대로 담고 있어 순수 로직 테스트·디버깅용으로만 쓰고,
// API 라우트는 반드시 code만 사용해 안전한 일반 문구로 매핑합니다.
export type BankRowParseErrorCode =
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "MISSING_AMOUNT"
  | "INVALID_AMOUNT"
  | "AMOUNT_TOO_LARGE"
  | "AMBIGUOUS_AMOUNT_DIRECTION"
  | "UNKNOWN_DIRECTION"
  | "DESCRIPTION_TOO_LONG";

export interface BankRowParseError {
  rowNumber: number; // 1-based, 헤더 다음 첫 데이터 행이 2
  code: BankRowParseErrorCode;
  error: string;
}

export interface BankCsvParseResult {
  rows: ParsedBankRow[];
  errors: BankRowParseError[];
}

// 이 기능(은행/카드 CSV 가져오기)이 허용하는 확장자. lib/importFile.ts는 표시상 .xls도
// 허용하지만, ExcelJS가 구형 바이너리 .xls를 안정적으로 지원하지 않으므로 이 기능에서는
// 금지합니다 — API 라우트가 이 목록으로 확장자를 먼저 걸러낸 뒤에만 parseUploadedRows를 호출합니다.
export const ALLOWED_CSV_EXTENSIONS = [".csv", ".xlsx"] as const;

export const MAX_CSV_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_CSV_ROWS = 5000; // 헤더를 제외한 데이터 행 수
export const MAX_DESCRIPTION_LENGTH = 300; // cashflowInputSchema의 memo 상한과 동일
export const MAX_SOURCE_LABEL_LENGTH = 100; // assetInputSchema의 institution 상한과 동일
export const MAX_TRANSACTION_AMOUNT = 1_000_000_000_000; // 1조원 — 손상된 값 방어용 상한

/**
 * 계좌번호 전체를 그대로 붙여넣은 것으로 보이는 값을 거절하기 위한 휴리스틱입니다.
 * 공백을 제거한 뒤 숫자와 하이픈으로만 이루어져 있고 숫자가 10자리 이상이면(국내 계좌번호의
 * 일반적인 길이) 계좌번호로 간주합니다. sourceLabel은 표시용 별칭이어야 하므로 이 값을
 * 거절합니다.
 */
export function looksLikeAccountNumber(value: string): boolean {
  const stripped = value.replace(/\s/g, "");
  if (!/^[0-9-]+$/.test(stripped)) return false;
  const digitCount = (stripped.match(/\d/g) ?? []).length;
  return digitCount >= 10;
}

export const bankCsvOptionsSchema = z.object({
  sourceType: z.enum(["BANK", "CARD"]),
  sourceLabel: z
    .string()
    .trim()
    .max(MAX_SOURCE_LABEL_LENGTH, "계좌 표시명이 너무 깁니다.")
    .refine((v) => !looksLikeAccountNumber(v), "계좌번호로 보이는 값은 사용할 수 없습니다.")
    .optional(),
});

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
const CARD_AMOUNT_HEADER_ALIASES = ["이용금액", "승인금액"];
const CANCEL_AMOUNT_HEADER_ALIASES = ["취소금액", "환불액", "환불금액"];
const DIRECTION_HEADER_ALIASES = ["입출금구분", "거래구분", "구분", "type", "direction"];

const INCOME_DIRECTION_VALUES = ["입금", "수입", "credit"];
const EXPENSE_DIRECTION_VALUES = ["출금", "지출", "debit"];

function pickHeaderValue(row: ParsedRow, aliases: string[]): string {
  for (const alias of aliases) {
    const found = Object.keys(row).find((k) => k.toLowerCase() === alias.toLowerCase());
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

// 구분자 있는 형식(YYYY-MM-DD 등, 앞뒤로 같은 구분자만 허용)과 구분자 없는 8자리(YYYYMMDD),
// 그 뒤에 아무것도 없거나 " HH:MM[:SS]" 또는 "THH:MM[:SS]"만 허용한다. 그 외 접미사가 붙으면
// (예: "2026-08-25abc") 매치 자체가 안 되어 거절된다. 문자열 그대로 비교하므로 Date 객체의
// 타임존 변환으로 날짜가 밀리는 일이 없다.
const DATE_WITH_SEPARATOR_RE = /^(\d{4})([-./])(\d{1,2})\2(\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
const DATE_WITHOUT_SEPARATOR_RE = /^(\d{4})(\d{2})(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;

/**
 * "2026-08-25" / "2026.08.25" / "2026/08/25" / "20260825" 형태를 파싱합니다. 뒤에 공백+시각
 * 또는 T+시각이 붙어도 되지만, 그 외 임의 문자열이 붙으면 거절합니다. 월별 실제 일수(윤년의
 * 2월 29일 포함)까지 검증하는 실제 달력 날짜 검증입니다.
 */
export function parseTransactionDate(raw: string): string | null {
  const trimmed = raw.trim();

  const withSep = trimmed.match(DATE_WITH_SEPARATOR_RE);
  const match = withSep ?? trimmed.match(DATE_WITHOUT_SEPARATOR_RE);
  if (!match) return null;

  // 구분자 있는 패턴은 [전체, 연, 구분자, 월, 일], 없는 패턴은 [전체, 연, 월, 일]
  const [year, monthRaw, dayRaw] = withSep ? [match[1], match[3], match[4]] : [match[1], match[2], match[3]];

  const yearNum = Number(year);
  const monthNum = Number(monthRaw);
  const dayNum = Number(dayRaw);
  if (monthNum < 1 || monthNum > 12) return null;
  if (dayNum < 1 || dayNum > daysInMonth(yearNum, monthNum)) return null;

  return `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

/** 적요 문자열의 앞뒤·연속 공백만 정리합니다 (그 외 가공 없음 — 원문 의미를 바꾸지 않기 위함) */
export function normalizeDescription(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

interface ResolvedAmount {
  amount: number; // 절대값
  isIncome: boolean;
}

function resolveDirectionValue(raw: string): "INCOME" | "EXPENSE" | null {
  const normalized = raw.trim().toLowerCase();
  if (INCOME_DIRECTION_VALUES.some((v) => v.toLowerCase() === normalized)) return "INCOME";
  if (EXPENSE_DIRECTION_VALUES.some((v) => v.toLowerCase() === normalized)) return "EXPENSE";
  return null;
}

/**
 * 거래 방향(입금/출금)과 금액을 판정합니다. 우선순위:
 * 1) 카드 이용/승인금액 열 — 부호와 무관하게 항상 지출 (카드 명세서의 양수 이용금액을
 *    소득으로 잘못 읽는 문제를 헤더 자체로 방지)
 * 2) 취소/환불 열 — 소득으로 처리
 * 3) 입금액/출금액 분리 열 — 둘 다 0이 아니면 방향을 판단할 수 없으므로 오류
 * 4) 단일 금액 열 + 입출금구분 열 — 구분값을 모르면 추측하지 않고 오류
 * 5) 단일 부호 있는 금액 열만 있는 경우 — sourceType이 "CARD"면 부호 무관 지출,
 *    그 외(기본값 포함)에는 기존처럼 부호로 판단 (양수=입금)
 */
type AmountResultWithCode =
  | { ok: true; value: ResolvedAmount }
  | { ok: false; error: string; code: BankRowParseErrorCode };

function checkAmountBounds(amount: number): BankRowParseErrorCode | null {
  return Math.abs(amount) > MAX_TRANSACTION_AMOUNT ? "AMOUNT_TOO_LARGE" : null;
}

function resolveAmount(row: ParsedRow, sourceType: BankCsvSourceType | undefined): AmountResultWithCode {
  const cardRaw = pickHeaderValue(row, CARD_AMOUNT_HEADER_ALIASES);
  if (cardRaw) {
    const amount = parseAmount(cardRaw);
    if (amount === null || amount === 0) {
      return { ok: false, error: `카드 이용금액을 인식할 수 없습니다: "${cardRaw}"`, code: "INVALID_AMOUNT" };
    }
    const boundsError = checkAmountBounds(amount);
    if (boundsError) return { ok: false, error: `카드 이용금액이 너무 큽니다: "${cardRaw}"`, code: boundsError };
    return { ok: true, value: { amount: Math.abs(amount), isIncome: false } };
  }

  const cancelRaw = pickHeaderValue(row, CANCEL_AMOUNT_HEADER_ALIASES);
  if (cancelRaw) {
    const amount = parseAmount(cancelRaw);
    if (amount === null || amount === 0) {
      return { ok: false, error: `취소·환불 금액을 인식할 수 없습니다: "${cancelRaw}"`, code: "INVALID_AMOUNT" };
    }
    const boundsError = checkAmountBounds(amount);
    if (boundsError) return { ok: false, error: `취소·환불 금액이 너무 큽니다: "${cancelRaw}"`, code: boundsError };
    return { ok: true, value: { amount: Math.abs(amount), isIncome: true } };
  }

  const depositRaw = pickHeaderValue(row, DEPOSIT_HEADER_ALIASES);
  const withdrawalRaw = pickHeaderValue(row, WITHDRAWAL_HEADER_ALIASES);
  const depositAmount = depositRaw ? parseAmount(depositRaw) : null;
  const withdrawalAmount = withdrawalRaw ? parseAmount(withdrawalRaw) : null;
  const hasDeposit = depositAmount !== null && depositAmount !== 0;
  const hasWithdrawal = withdrawalAmount !== null && withdrawalAmount !== 0;
  if (hasDeposit && hasWithdrawal) {
    return {
      ok: false,
      error: "입금액과 출금액이 동시에 존재해 방향을 판단할 수 없습니다.",
      code: "AMBIGUOUS_AMOUNT_DIRECTION",
    };
  }
  if (hasDeposit) {
    const boundsError = checkAmountBounds(depositAmount as number);
    if (boundsError) return { ok: false, error: "입금액이 너무 큽니다.", code: boundsError };
    return { ok: true, value: { amount: Math.abs(depositAmount as number), isIncome: true } };
  }
  if (hasWithdrawal) {
    const boundsError = checkAmountBounds(withdrawalAmount as number);
    if (boundsError) return { ok: false, error: "출금액이 너무 큽니다.", code: boundsError };
    return { ok: true, value: { amount: Math.abs(withdrawalAmount as number), isIncome: false } };
  }

  const amountRaw = pickHeaderValue(row, AMOUNT_HEADER_ALIASES);
  const directionRaw = pickHeaderValue(row, DIRECTION_HEADER_ALIASES);
  if (amountRaw && directionRaw) {
    const amount = parseAmount(amountRaw);
    if (amount === null || amount === 0) {
      return { ok: false, error: `금액을 인식할 수 없습니다: "${amountRaw}"`, code: "INVALID_AMOUNT" };
    }
    const boundsError = checkAmountBounds(amount);
    if (boundsError) return { ok: false, error: `금액이 너무 큽니다: "${amountRaw}"`, code: boundsError };
    const direction = resolveDirectionValue(directionRaw);
    if (!direction) {
      return { ok: false, error: `입출금구분 값을 인식할 수 없습니다: "${directionRaw}"`, code: "UNKNOWN_DIRECTION" };
    }
    return { ok: true, value: { amount: Math.abs(amount), isIncome: direction === "INCOME" } };
  }

  if (amountRaw) {
    const amount = parseAmount(amountRaw);
    if (amount === null || amount === 0) {
      return { ok: false, error: `금액을 인식할 수 없습니다: "${amountRaw}"`, code: "INVALID_AMOUNT" };
    }
    const boundsError = checkAmountBounds(amount);
    if (boundsError) return { ok: false, error: `금액이 너무 큽니다: "${amountRaw}"`, code: boundsError };
    if (sourceType === "CARD") {
      return { ok: true, value: { amount: Math.abs(amount), isIncome: false } };
    }
    return { ok: true, value: { amount: Math.abs(amount), isIncome: amount > 0 } };
  }

  return {
    ok: false,
    error: "입금/출금/거래금액 중 유효한 금액 열을 찾을 수 없습니다.",
    code: "MISSING_AMOUNT",
  };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// "cu", "kt"처럼 짧은 영문 키워드가 일반 단어에 우연히 포함되어(예: "BACKTRACK"의 "kt")
// 오분류되지 않도록, 순수 ASCII 영숫자 키워드는 단어 경계(\b)가 있을 때만 매칭한다.
// 한글이 섞인 키워드("lgu+", "카카오t" 등)는 기존처럼 부분 문자열 매칭을 유지한다 —
// 한글에는 \b 경계 개념이 의미 있게 적용되지 않기 때문이다.
function isAsciiAlnumToken(keyword: string): boolean {
  return /^[a-z0-9]+$/i.test(keyword);
}

function keywordMatches(description: string, keyword: string): boolean {
  if (isAsciiAlnumToken(keyword)) {
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(description);
  }
  return description.toLowerCase().includes(keyword.toLowerCase());
}

function matchKeyword(description: string, dict: Record<string, string[]>): string | null {
  for (const [category, keywords] of Object.entries(dict)) {
    if (keywords.some((kw) => keywordMatches(description, kw))) return category;
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

function parseSingleRow(
  row: ParsedRow,
  rowNumber: number,
  options: ParseBankCsvOptions
): { row: ParsedBankRow } | { error: BankRowParseError } {
  const dateRaw = pickHeaderValue(row, DATE_HEADER_ALIASES);
  if (!dateRaw) {
    return { error: { rowNumber, error: "거래일 열을 찾을 수 없습니다.", code: "MISSING_DATE" } };
  }
  const transactionDate = parseTransactionDate(dateRaw);
  if (!transactionDate) {
    return {
      error: { rowNumber, error: `거래일을 인식할 수 없습니다: "${dateRaw}"`, code: "INVALID_DATE" },
    };
  }

  const resolved = resolveAmount(row, options.sourceType);
  if (!resolved.ok) {
    return { error: { rowNumber, error: resolved.error, code: resolved.code } };
  }

  const descriptionRaw = pickHeaderValue(row, DESCRIPTION_HEADER_ALIASES);
  const description = normalizeDescription(descriptionRaw);
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { error: { rowNumber, error: "적요가 너무 깁니다.", code: "DESCRIPTION_TOO_LONG" } };
  }

  const { type, category } = classifyTransaction(description, resolved.value.isIncome);
  const signedAmount = resolved.value.isIncome ? resolved.value.amount : -resolved.value.amount;
  const rowFingerprint = computeRowFingerprint(transactionDate, signedAmount, description);

  return {
    row: {
      rowNumber,
      transactionDate,
      yearMonth: transactionDate.slice(0, 7),
      type,
      category,
      amount: resolved.value.amount,
      description,
      rowFingerprint,
    },
  };
}

/** 파일 하나에 속한 행들을 순서대로 처리합니다. DB나 다른 파일과의 비교는 하지 않습니다. */
export function parseBankCsvRows(
  rows: readonly ParsedRow[],
  options: ParseBankCsvOptions = {}
): BankCsvParseResult {
  const parsed: ParsedBankRow[] = [];
  const errors: BankRowParseError[] = [];

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 헤더가 1행이므로 첫 데이터 행은 2
    const result = parseSingleRow(row, rowNumber, options);
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
