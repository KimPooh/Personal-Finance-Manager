import type { BankRowParseErrorCode } from "@/lib/bankCsvImport";
import type { TFunction } from "@/lib/i18n/t";

// 은행/카드 CSV 가져오기 UI(components/cashflow/CsvImportPanel.tsx)에서 쓰는 순수 로직만
// 모았습니다. 컴포넌트 렌더링과 분리해 두어야 테스트가 React 렌더링 없이 이 매핑/포맷팅
// 로직만 검증할 수 있습니다.

// BankRowParseErrorCode는 lib/bankCsvImport.ts에서 타입만 가져옵니다(값 import 아님 - 이
// 파일은 컴포넌트에서도 쓰이므로 순수 로직 모듈의 타입 외 어떤 값도 끌어오지 않습니다).
// Record<BankRowParseErrorCode, string>이라 그 타입에 코드가 새로 추가되면 여기 키가
// 하나라도 빠졌을 때 컴파일 타임에 바로 잡힙니다.
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
