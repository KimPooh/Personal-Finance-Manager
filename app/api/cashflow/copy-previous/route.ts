import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { decryptOptional, encryptOptional } from "@/lib/crypto";
import { cashflowCopyPreviousInputSchema } from "@/lib/validation";
import { shiftYearMonth } from "@/lib/format";
import { planCashflowCopies } from "@/lib/cashflowCopy";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = cashflowCopyPreviousInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const { targetMonth } = parsed.data;
  const sourceMonth = shiftYearMonth(targetMonth, -1);

  const [sourceEntries, targetEntries] = await Promise.all([
    prisma.cashflowEntry.findMany({ where: { yearMonth: sourceMonth } }),
    prisma.cashflowEntry.findMany({ where: { yearMonth: targetMonth } }),
  ]);

  if (sourceEntries.length === 0) {
    return NextResponse.json({
      sourceMonth,
      targetMonth,
      sourceCount: 0,
      copiedCount: 0,
      skippedCount: 0,
    });
  }

  const sourcePlain = sourceEntries.map((entry) => ({
    type: entry.type,
    category: entry.category,
    amount: entry.amount,
    memo: decryptOptional(entry.memoEnc),
  }));
  const targetPlain = targetEntries.map((entry) => ({
    type: entry.type,
    category: entry.category,
    amount: entry.amount,
    memo: decryptOptional(entry.memoEnc),
  }));
  const { toCreate, skippedCount } = planCashflowCopies(sourcePlain, targetPlain);

  if (toCreate.length > 0) {
    await prisma.cashflowEntry.createMany({
      data: toCreate.map((item) => ({
        yearMonth: targetMonth,
        type: item.type,
        category: item.category,
        amount: item.amount,
        memoEnc: encryptOptional(item.memo),
      })),
    });
  }

  return NextResponse.json({
    sourceMonth,
    targetMonth,
    sourceCount: sourceEntries.length,
    copiedCount: toCreate.length,
    skippedCount,
  });
}
