import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const history = await prisma.assetHistory.findMany({
    where: { assetId: id },
    orderBy: { recordedAt: "desc" },
  });

  return NextResponse.json({
    history: history.map((h) => ({ id: h.id, value: h.value, recordedAt: h.recordedAt })),
  });
}
