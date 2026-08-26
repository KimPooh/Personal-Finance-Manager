"use client";

import { KOREAN_FINANCIAL_INSTITUTIONS } from "@/lib/financialInstitutions";

export function InstitutionInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const listId = `${id}-institutions`;

  return (
    <>
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder={placeholder}
        autoComplete="organization"
      />
      <datalist id={listId}>
        {KOREAN_FINANCIAL_INSTITUTIONS.map((institution) => (
          <option key={institution} value={institution} />
        ))}
      </datalist>
    </>
  );
}
