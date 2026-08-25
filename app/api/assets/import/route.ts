import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { assetInputSchema } from "@/lib/validation";
import { parseUploadedRows, parseAmount } from "@/lib/importFile";
import { ASSET_CATEGORIES, resolveCategoryCode } from "@/lib/categories";

// 지원 헤더: 카테고리/category, 이름/name, 현재금액/currentValue, 취득일/acquiredDate, 기관/institution, 메모/memo
function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  }

  let rows;
  try {
    rows = await parseUploadedRows(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "파일을 읽을 수 없습니다." },
      { status: 400 }
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });
  }

  const results: { row: number; error: string }[] = [];
  const toCreate: {
    category: string;
    name: string;
    currentValue: number;
    acquiredDate: string | null;
    institution: string | null;
    memo: string | null;
  }[] = [];

  rows.forEach((row, idx) => {
    const rawCategory = pick(row, ["category", "카테고리"]);
    const categoryCode = rawCategory ? resolveCategoryCode(ASSET_CATEGORIES, rawCategory) : null;
    const name = pick(row, ["name", "이름", "자산명"]);
    const rawAmount = pick(row, ["currentValue", "현재금액", "금액"]);
    const amount = rawAmount ? parseAmount(rawAmount) : null;
    const acquiredDate = pick(row, ["acquiredDate", "취득일"]) || null;
    const institution = pick(row, ["institution", "기관", "금융회사"]) || null;
    const memo = pick(row, ["memo", "메모"]) || null;

    if (!categoryCode) {
      results.push({ row: idx + 2, error: `카테고리를 인식할 수 없습니다: "${rawCategory}"` });
      return;
    }
    if (amount === null) {
      results.push({ row: idx + 2, error: `금액을 인식할 수 없습니다: "${rawAmount}"` });
      return;
    }

    const parsed = assetInputSchema.safeParse({
      category: categoryCode,
      name,
      currentValue: amount,
      acquiredDate,
      institution,
      memo,
    });
    if (!parsed.success) {
      results.push({ row: idx + 2, error: parsed.error.issues[0]?.message ?? "입력값 오류" });
      return;
    }

    toCreate.push({
      category: parsed.data.category,
      name: parsed.data.name,
      currentValue: parsed.data.currentValue,
      acquiredDate: parsed.data.acquiredDate ?? null,
      institution: parsed.data.institution ?? null,
      memo: parsed.data.memo ?? null,
    });
  });

  for (const item of toCreate) {
    await prisma.asset.create({
      data: {
        category: item.category,
        name: item.name,
        currentValue: item.currentValue,
        acquiredDate: item.acquiredDate ? new Date(item.acquiredDate) : null,
        institutionEnc: encryptOptional(item.institution),
        memoEnc: encryptOptional(item.memo),
        history: { create: { value: item.currentValue, recordedAt: new Date() } },
      },
    });
  }

  return NextResponse.json({ created: toCreate.length, failed: results });
}
