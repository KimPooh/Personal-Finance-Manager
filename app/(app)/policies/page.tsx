import { prisma } from "@/lib/db";
import { CURATED_POLICIES } from "@/lib/policyData";
import { evaluatePolicy, type UserProfileInput } from "@/lib/policyMatching";
import { PolicyRecommendations } from "@/components/policies/PolicyRecommendations";
import { getServerT } from "@/lib/i18n/server";

export default async function PoliciesPage() {
  const { t, locale } = await getServerT();

  await Promise.all(
    CURATED_POLICIES.map((p) =>
      prisma.policyProgram.upsert({
        where: { slug: p.slug },
        update: {
          title: p.title,
          agency: p.agency,
          summary: p.summary,
          targetCriteriaJson: JSON.stringify({
            eligibilityText: p.eligibilityText,
            simpleSummary: p.simpleSummary,
          }),
          benefit: p.benefit,
          applicationPeriod: p.applicationPeriod,
          requiredDocuments: p.requiredDocuments,
          officialUrl: p.officialUrl,
          sourceName: p.sourceName,
          verifiedDate: new Date(p.verifiedDate),
          status: "ACTIVE",
        },
        create: {
          slug: p.slug,
          title: p.title,
          agency: p.agency,
          summary: p.summary,
          targetCriteriaJson: JSON.stringify({
            eligibilityText: p.eligibilityText,
            simpleSummary: p.simpleSummary,
          }),
          benefit: p.benefit,
          applicationPeriod: p.applicationPeriod,
          requiredDocuments: p.requiredDocuments,
          officialUrl: p.officialUrl,
          sourceName: p.sourceName,
          verifiedDate: new Date(p.verifiedDate),
        },
      })
    )
  );

  const [policies, profile] = await Promise.all([
    prisma.policyProgram.findMany({ where: { status: "ACTIVE" } }),
    prisma.userProfile.findFirst(),
  ]);

  const profileInput: UserProfileInput = {
    age: profile?.age ?? null,
    region: profile?.region ?? null,
    householdAnnualIncomeManwon: profile?.householdAnnualIncomeManwon ?? null,
    occupation: profile?.occupation ?? null,
    householdType: profile?.householdType ?? null,
    maritalStatus: profile?.maritalStatus ?? null,
    numberOfChildren: profile?.numberOfChildren ?? null,
    homeOwnership: profile?.homeOwnership ?? null,
  };

  const items = policies.map((p) => {
    const match = evaluatePolicy(p.slug, profileInput);
    const extra = JSON.parse(p.targetCriteriaJson) as {
      eligibilityText: string;
      simpleSummary?: { ko: string; en: string };
    };
    return {
      slug: p.slug,
      title: p.title,
      agency: p.agency,
      summary: p.summary,
      eligibilityText: extra.eligibilityText,
      simpleSummary: extra.simpleSummary ? extra.simpleSummary[locale] : null,
      benefit: p.benefit,
      applicationPeriod: p.applicationPeriod,
      requiredDocuments: p.requiredDocuments,
      officialUrl: p.officialUrl,
      sourceName: p.sourceName,
      verifiedDate: p.verifiedDate.toISOString().slice(0, 10),
      verdict: match.verdict,
      reason: match.reason,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("policies.title")}</h1>
        <p className="text-sm text-slate-500">{t("policies.subtitle")}</p>
      </div>
      <PolicyRecommendations
        initialProfile={{
          age: profile?.age ?? null,
          region: profile?.region ?? null,
          householdAnnualIncomeManwon: profile?.householdAnnualIncomeManwon ?? null,
          occupation: profile?.occupation ?? null,
          householdType: profile?.householdType ?? null,
          maritalStatus: profile?.maritalStatus ?? null,
          numberOfChildren: profile?.numberOfChildren ?? null,
          homeOwnership: profile?.homeOwnership ?? null,
        }}
        policies={items}
      />
    </div>
  );
}
