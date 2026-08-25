import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { userProfileInputSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = userProfileInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const existing = await prisma.userProfile.findFirst();
  if (existing) {
    await prisma.userProfile.update({ where: { id: existing.id }, data: input });
  } else {
    await prisma.userProfile.create({ data: input });
  }

  return NextResponse.json({ ok: true });
}
