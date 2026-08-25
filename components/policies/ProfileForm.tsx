"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface ProfileFormValues {
  age: number | null;
  region: string | null;
  householdAnnualIncomeManwon: number | null;
  occupation: string | null;
  householdType: string | null;
  maritalStatus: string | null;
  numberOfChildren: number | null;
  homeOwnership: string | null;
}

const REGIONS = [
  "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
];

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const router = useRouter();
  const { t } = useLocale();
  const [age, setAge] = useState(initial.age != null ? String(initial.age) : "");
  const [region, setRegion] = useState(initial.region ?? "");
  const [income, setIncome] = useState(
    initial.householdAnnualIncomeManwon != null ? String(initial.householdAnnualIncomeManwon) : ""
  );
  const [occupation, setOccupation] = useState(initial.occupation ?? "");
  const [householdType, setHouseholdType] = useState(initial.householdType ?? "");
  const [maritalStatus, setMaritalStatus] = useState(initial.maritalStatus ?? "미혼");
  const [children, setChildren] = useState(
    initial.numberOfChildren != null ? String(initial.numberOfChildren) : "0"
  );
  const [homeOwnership, setHomeOwnership] = useState(initial.homeOwnership ?? "NONE");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        age: age ? Number(age) : null,
        region: region || null,
        householdAnnualIncomeManwon: income ? Number(income) : null,
        occupation: occupation || null,
        householdType: householdType || null,
        maritalStatus: maritalStatus || null,
        numberOfChildren: children ? Number(children) : 0,
        homeOwnership,
      }),
    });
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileAge")}</label>
        <input
          type="number"
          min={0}
          max={120}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileRegion")}</label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("policies.profileRegionNone")}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileIncome")}</label>
        <input
          type="number"
          min={0}
          value={income}
          onChange={(e) => setIncome(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("policies.profileIncomePlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileOccupation")}</label>
        <select
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("policies.profileRegionNone")}</option>
          <option value="직장인">{t("policies.occupationEmployed")}</option>
          <option value="자영업자">{t("policies.occupationSelfEmployed")}</option>
          <option value="프리랜서">{t("policies.occupationFreelancer")}</option>
          <option value="무직">{t("policies.occupationUnemployed")}</option>
          <option value="학생">{t("policies.occupationStudent")}</option>
          <option value="기타">{t("policies.occupationOther")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileHouseholdType")}</label>
        <select
          value={householdType}
          onChange={(e) => setHouseholdType(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{t("policies.profileRegionNone")}</option>
          <option value="1인가구">{t("policies.householdSolo")}</option>
          <option value="부부">{t("policies.householdCouple")}</option>
          <option value="부부+자녀">{t("policies.householdCoupleWithKids")}</option>
          <option value="한부모가정">{t("policies.householdSingleParent")}</option>
          <option value="기타">{t("policies.householdOther")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileMaritalStatus")}</label>
        <select
          value={maritalStatus}
          onChange={(e) => setMaritalStatus(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="미혼">{t("policies.maritalSingle")}</option>
          <option value="기혼">{t("policies.maritalMarried")}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileChildren")}</label>
        <input
          type="number"
          min={0}
          max={20}
          value={children}
          onChange={(e) => setChildren(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("policies.profileHomeOwnership")}</label>
        <select
          value={homeOwnership}
          onChange={(e) => setHomeOwnership(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="NONE">{t("policies.homeOwnershipNone")}</option>
          <option value="OWNS">{t("policies.homeOwnershipOwns")}</option>
        </select>
      </div>

      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t("common.saving") : t("policies.saveProfile")}
        </button>
        {saved && <span className="text-xs text-emerald-600">{t("policies.saved")}</span>}
      </div>
    </form>
  );
}
