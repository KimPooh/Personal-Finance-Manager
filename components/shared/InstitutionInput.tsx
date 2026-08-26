"use client";

import { useState } from "react";
import { KOREAN_FINANCIAL_INSTITUTIONS } from "@/lib/financialInstitutions";
import { useLocale } from "@/lib/i18n/LocaleProvider";

// 모바일(특히 Android Chrome)에서는 <input list>+<datalist> 제안 목록이 키보드 위
// 가로 스크롤 칩으로만 뜨고, 탭만으로는 열리지 않거나 한 번 고른 뒤 다시 열리지 않는
// 경우가 흔합니다. 그래서 목록 선택은 항상 신뢰할 수 있게 열리고 다시 여닫히는 네이티브
// <select>로 하고, 목록에 없는 값은 "직접 입력"을 고르면 나오는 별도 텍스트 입력으로
// 처리합니다 - 대출 종류 선택(<select>)과 같은 방식이라 동작이 예측 가능합니다.
const CUSTOM_OPTION = "__custom__";

export function InstitutionInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const isListed = (KOREAN_FINANCIAL_INSTITUTIONS as readonly string[]).includes(value);
  // 이미 목록에 없는 값(예전에 직접 입력해 저장된 기관명)이 있으면 직접 입력 모드로 시작합니다.
  const [customMode, setCustomMode] = useState(value !== "" && !isListed);

  function handleSelectChange(next: string) {
    if (next === CUSTOM_OPTION) {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    onChange(next);
  }

  if (customMode) {
    return (
      <div className="flex flex-col gap-1">
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={placeholder}
          autoComplete="organization"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          className="self-start text-xs text-slate-500 underline-offset-2 hover:text-accent hover:underline disabled:opacity-50"
        >
          {t("common.institutionPickFromList")}
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={isListed ? value : ""}
      disabled={disabled}
      onChange={(e) => handleSelectChange(e.target.value)}
      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
    >
      <option value="">{t("common.institutionNotSelected")}</option>
      <option value={CUSTOM_OPTION}>{t("common.institutionEnterManually")}</option>
      {KOREAN_FINANCIAL_INSTITUTIONS.map((institution) => (
        <option key={institution} value={institution}>
          {institution}
        </option>
      ))}
    </select>
  );
}
