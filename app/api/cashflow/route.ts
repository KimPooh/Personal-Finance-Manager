import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { cashflowInputSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = cashflowInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const entry = await prisma.cashflowEntry.create({
    data: {
      yearMonth: input.yearMonth,
      type: input.type,
      category: input.category,
      amount: input.amount,
      memoEnc: encryptOptional(input.memo),
    },
  });

  return NextResponse.json({ id: entry.id });
}
