import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { checkPolicyUpdates, isAdvisorConfigured } from "@/lib/anthropic";

// 큐레이션된 정부 정책 데이터를 Claude의 웹 검색 도구로 공식 출처와 재대조합니다.
// Anthropic API 키가 필요하며 (설정 화면의 Claude 상담 기능과 동일한 키 사용),
// 실제로 재확인된 항목만 갱신하고, 확인 불가/종료된 항목은 추측 없이 표시합니다.
export async function POST() {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  if (!isAdvisorConfigured()) {
    return NextResponse.json(
      { error: "Anthropic API 키가 설정되지 않아 이 기능을 사용할 수 없습니다." },
      { status: 503 }
    );
  }

  const policies = await prisma.policyProgram.findMany({ where: { status: "ACTIVE" } });
  if (policies.length === 0) {
    return NextResponse.json({ results: [], checkedAt: new Date().toISOString().slice(0, 10) });
  }

  const input = policies.map((p) => {
    const extra = JSON.parse(p.targetCriteriaJson) as {
      eligibilityText: string;
      simpleSummary?: { ko: string; en: string };
    };
    return {
      slug: p.slug,
      title: p.title,
      officialUrl: p.officialUrl,
      eligibilityText: extra.eligibilityText,
      benefit: p.benefit,
      applicationPeriod: p.applicationPeriod,
      requiredDocuments: p.requiredDocuments,
      verifiedDate: p.verifiedDate.toISOString().slice(0, 10),
    };
  });

  let checkResult;
  try {
    checkResult = await checkPolicyUpdates(input);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "확인 중 오류가 발생했습니다." },
      { status: 502 }
    );
  }

  const applied: { slug: string; status: string; note: string }[] = [];

  for (const result of checkResult.results) {
    const existing = policies.find((p) => p.slug === result.slug);
    if (!existing) continue;

    if (result.status === "ended") {
      await prisma.policyProgram.update({
        where: { slug: result.slug },
        data: { status: "ENDED" },
      });
    } else if (result.status === "updated" || result.status === "unchanged") {
      const extra = JSON.parse(existing.targetCriteriaJson) as {
        eligibilityText: string;
        simpleSummary?: { ko: string; en: string };
      };
      const changes = result.changes ?? {};
      await prisma.policyProgram.update({
        where: { slug: result.slug },
        data: {
          title: changes.title ?? existing.title,
          benefit: changes.benefit ?? existing.benefit,
          applicationPeriod: changes.applicationPeriod ?? existing.applicationPeriod,
          requiredDocuments: changes.requiredDocuments ?? existing.requiredDocuments,
          targetCriteriaJson: JSON.stringify({
            eligibilityText: changes.eligibilityText ?? extra.eligibilityText,
            simpleSummary: extra.simpleSummary,
          }),
          verifiedDate: new Date(checkResult.checkedAt),
        },
      });
    }
    // "unverified" — 확인 불가 시 아무것도 변경하지 않음 (확인일도 유지).

    applied.push({ slug: result.slug, status: result.status, note: result.note });
  }

  return NextResponse.json({ results: applied, checkedAt: checkResult.checkedAt });
}
