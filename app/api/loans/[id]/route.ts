import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { loanInputSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = loanInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const existing = await prisma.loan.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "대출을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.loan.update({
    where: { id },
    data: {
      category: input.category,
      institutionEnc: encryptOptional(input.institution),
      principal: input.principal,
      balance: input.balance,
      interestRate: input.interestRate,
      rateType: input.rateType,
      repaymentMethod: input.repaymentMethod,
      monthlyPayment: input.monthlyPayment ?? null,
      startDate: new Date(input.startDate),
      maturityDate: new Date(input.maturityDate),
      rateChangeDate: input.rateChangeDate ? new Date(input.rateChangeDate) : null,
      memoEnc: encryptOptional(input.memo),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  await prisma.loan.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
