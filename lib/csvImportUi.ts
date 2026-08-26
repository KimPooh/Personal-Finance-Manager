import type { TFunction } from "@/lib/i18n/t";

// 은행/카드 CSV 가져오기 UI(components/cashflow/CsvImportPanel.tsx)에서 쓰는 순수 로직만
// 모았습니다. 컴포넌트 렌더링과 분리해 두어야 테스트가 React 렌더링 없이 이 매핑/포맷팅
// 로직만 검증할 수 있습니다.

export type BankRowParseErrorCode =
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "MISSING_AMOUNT"
  | "INVALID_AMOUNT"
  | "AMOUNT_TOO_LARGE"
  | "AMBIGUOUS_AMOUNT_DIRECTION"
  | "UNKNOWN_DIRECTION"
  | "DESCRIPTION_TOO_LONG";

// lib/bankCsvImport.ts의 BankRowParseErrorCode 전체 목록과 정확히 일치해야 합니다 (하나라도
// 빠지면 아래 Record 타입 체크가 실패합니다 - 새 코드가 추가되면 여기도 함께 갱신하세요).
export const ERROR_CODE_KEYS: Record<BankRowParseErrorCode, string> = {
  MISSING_DATE: "cashflow.csvImportErrorMissingDate",
  INVALID_DATE: "cashflow.csvImportErrorInvalidDate",
  MISSING_AMOUNT: "cashflow.csvImportErrorMissingAmount",
  INVALID_AMOUNT: "cashflow.csvImportErrorInvalidAmount",
  AMOUNT_TOO_LARGE: "cashflow.csvImportErrorAmountTooLarge",
  AMBIGUOUS_AMOUNT_DIRECTION: "cashflow.csvImportErrorAmbiguousDirection",
  UNKNOWN_DIRECTION: "cashflow.csvImportErrorUnknownDirection",
  DESCRIPTION_TOO_LONG: "cashflow.csvImportErrorDescriptionTooLong",
};

/** 알 수 없는 code가 와도(예: 서버가 나중에 새 코드를 추가) 안전한 일반 문구로 대체합니다. */
export function errorMessage(t: TFunction, code: string): string {
  const key = ERROR_CODE_KEYS[code as BankRowParseErrorCode];
  return t(key ?? "cashflow.csvImportErrorUnknown");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
