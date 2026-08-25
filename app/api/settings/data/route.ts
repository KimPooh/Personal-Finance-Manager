import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";

export async function DELETE() {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  await prisma.$transaction([
    prisma.chatMessage.deleteMany(),
    prisma.assetHistory.deleteMany(),
    prisma.cashflowEntry.deleteMany(),
    prisma.netWorthSnapshot.deleteMany(),
    prisma.loan.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.userProfile.deleteMany(),
  ]);

  return NextResponse.json({ ok: true });
}
