import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptOptional } from "@/lib/crypto";
import { assetInputSchema } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = assetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const asset = await prisma.asset.create({
    data: {
      category: input.category,
      name: input.name,
      currentValue: input.currentValue,
      acquiredDate: input.acquiredDate ? new Date(input.acquiredDate) : null,
      institutionEnc: encryptOptional(input.institution),
      memoEnc: encryptOptional(input.memo),
      history: {
        create: {
          value: input.currentValue,
          recordedAt: new Date(),
        },
      },
    },
  });

  return NextResponse.json({ id: asset.id });
}
