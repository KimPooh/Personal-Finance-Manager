import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";

// 백업 파일은 저장된 형태 그대로(민감 텍스트는 암호화된 채로) 내보냅니다.
// 복원 시 이 파일을 만든 것과 동일한 ENCRYPTION_KEY를 사용하는 앱에서만
// 정상적으로 복호화됩니다.
export async function GET() {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const [
    assets,
    assetHistory,
    loans,
    cashflowEntries,
    netWorthSnapshots,
    chatMessages,
    csvImportRecords,
    profile,
  ] = await Promise.all([
    prisma.asset.findMany(),
    prisma.assetHistory.findMany(),
    prisma.loan.findMany(),
    prisma.cashflowEntry.findMany(),
    prisma.netWorthSnapshot.findMany(),
    prisma.chatMessage.findMany(),
    prisma.csvImportRecord.findMany(),
    prisma.userProfile.findFirst(),
  ]);

  const backup = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    assets,
    assetHistory,
    loans,
    cashflowEntries,
    netWorthSnapshots,
    chatMessages,
    csvImportRecords,
    profile,
  };

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="finance-backup-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
