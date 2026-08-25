import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { validateBackupFile, validateBackupDecryptable, restoreBackup } from "@/lib/backup";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);

  const validated = validateBackupFile(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const decryptable = validateBackupDecryptable(validated.data);
  if (!decryptable.ok) {
    return NextResponse.json({ error: decryptable.error }, { status: 400 });
  }

  try {
    await prisma.$transaction((tx) => restoreBackup(tx, validated.data));
  } catch {
    return NextResponse.json(
      { error: "복원 중 오류가 발생했습니다. 파일이 손상되었을 수 있습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
