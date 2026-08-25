import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { cashflowInputSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = cashflowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  await prisma.cashflowEntry
    .update({
      where: { id },
      data: {
        yearMonth: input.yearMonth,
        type: input.type,
        category: input.category,
        amount: input.amount,
        memoEnc: encryptOptional(input.memo),
      },
    })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  await prisma.cashflowEntry.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
