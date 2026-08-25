import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { assetInputSchema } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = assetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "자산을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.asset.update({
    where: { id },
    data: {
      category: input.category,
      name: input.name,
      currentValue: input.currentValue,
      acquiredDate: input.acquiredDate ? new Date(input.acquiredDate) : null,
      institutionEnc: encryptOptional(input.institution),
      memoEnc: encryptOptional(input.memo),
      ...(existing.currentValue !== input.currentValue
        ? { history: { create: { value: input.currentValue, recordedAt: new Date() } } }
        : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await params;
  await prisma.asset.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
