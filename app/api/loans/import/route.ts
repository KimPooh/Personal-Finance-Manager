import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { loanInputSchema } from "@/lib/validation";
import { parseUploadedRows, parseAmount } from "@/lib/importFile";
import { LOAN_CATEGORIES, RATE_TYPES, REPAYMENT_METHODS, resolveCategoryCode } from "@/lib/categories";
import { isEncryptedXlsxFile } from "@/lib/uploadFile";

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
  if (await isEncryptedXlsxFile(file)) {
    return NextResponse.json(
      { error: "비밀번호가 설정된 엑셀 파일입니다. 암호를 해제해 다시 저장해주세요." },
      { status: 400 }
    );
  }

  let rows;
  try {
    rows = await parseUploadedRows(file);
  } catch {
    // 파서(ExcelJS 등)의 내부 예외 메시지를 그대로 응답에 담지 않습니다 - 원문은 영문
    // 라이브러리 내부 문구라 사용자에게 의미가 없고, 구현 세부사항을 노출할 뿐입니다.
    return NextResponse.json(
      { error: "파일을 읽을 수 없습니다. CSV 또는 .xlsx 파일인지 확인해주세요." },
      { status: 400 }
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "파일에 데이터가 없습니다." }, { status: 400 });
  }

  const results: { row: number; error: string }[] = [];
  const toCreate: Array<{
    category: string;
    institution: string | null;
    principal: number;
    balance: number;
    interestRate: number;
    rateType: string;
    repaymentMethod: string;
    monthlyPayment: number | null;
    startDate: string;
    maturityDate: string;
    rateChangeDate: string | null;
    memo: string | null;
  }> = [];

  rows.forEach((row, idx) => {
    const rawCategory = pick(row, ["category", "카테고리"]);
    const categoryCode = rawCategory ? resolveCategoryCode(LOAN_CATEGORIES, rawCategory) : null;
    const rawRateType = pick(row, ["rateType", "금리유형"]) || "고정금리";
    const rateTypeCode = resolveCategoryCode(RATE_TYPES, rawRateType);
    const rawRepayment = pick(row, ["repaymentMethod", "상환방식"]) || "원리금균등상환";
    const repaymentCode = resolveCategoryCode(REPAYMENT_METHODS, rawRepayment);

    const institution = pick(row, ["institution", "금융회사", "기관"]) || null;
    const principal = parseAmount(pick(row, ["principal", "대출원금", "원금"]));
    const balance = parseAmount(pick(row, ["balance", "대출잔액", "잔액"]));
    const interestRate = parseAmount(pick(row, ["interestRate", "금리"]));
    const monthlyPaymentRaw = pick(row, ["monthlyPayment", "월상환액"]);
    const monthlyPayment = monthlyPaymentRaw ? parseAmount(monthlyPaymentRaw) : null;
    const startDate = pick(row, ["startDate", "실행일"]);
    const maturityDate = pick(row, ["maturityDate", "만기일"]);
    const rateChangeDate = pick(row, ["rateChangeDate", "금리변경일"]) || null;
    const memo = pick(row, ["memo", "메모"]) || null;

    if (!categoryCode) {
      results.push({ row: idx + 2, error: `대출 종류를 인식할 수 없습니다: "${rawCategory}"` });
      return;
    }
    if (!rateTypeCode || !repaymentCode) {
      results.push({ row: idx + 2, error: "금리유형/상환방식을 인식할 수 없습니다." });
      return;
    }
    if (principal === null || balance === null || interestRate === null) {
      results.push({ row: idx + 2, error: "원금/잔액/금리 숫자를 인식할 수 없습니다." });
      return;
    }

    const parsed = loanInputSchema.safeParse({
      category: categoryCode,
      institution,
      principal,
      balance,
      interestRate,
      rateType: rateTypeCode,
      repaymentMethod: repaymentCode,
      monthlyPayment,
      startDate,
      maturityDate,
      rateChangeDate,
      memo,
    });
    if (!parsed.success) {
      results.push({ row: idx + 2, error: parsed.error.issues[0]?.message ?? "입력값 오류" });
      return;
    }

    toCreate.push({
      category: parsed.data.category,
      institution: parsed.data.institution ?? null,
      principal: parsed.data.principal,
      balance: parsed.data.balance,
      interestRate: parsed.data.interestRate,
      rateType: parsed.data.rateType,
      repaymentMethod: parsed.data.repaymentMethod,
      monthlyPayment: parsed.data.monthlyPayment ?? null,
      startDate: parsed.data.startDate,
      maturityDate: parsed.data.maturityDate,
      rateChangeDate: parsed.data.rateChangeDate ?? null,
      memo: parsed.data.memo ?? null,
    });
  });

  for (const item of toCreate) {
    await prisma.loan.create({
      data: {
        category: item.category,
        institutionEnc: encryptOptional(item.institution),
        principal: item.principal,
        balance: item.balance,
        interestRate: item.interestRate,
        rateType: item.rateType,
        repaymentMethod: item.repaymentMethod,
        monthlyPayment: item.monthlyPayment,
        startDate: new Date(item.startDate),
        maturityDate: new Date(item.maturityDate),
        rateChangeDate: item.rateChangeDate ? new Date(item.rateChangeDate) : null,
        memoEnc: encryptOptional(item.memo),
      },
    });
  }

  return NextResponse.json({ created: toCreate.length, failed: results });
}
