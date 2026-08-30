import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  // 공개 회원가입 차단: production(NODE_ENV=production - Vercel Production/Preview와
  // 로컬 next start 전부 포함)에서는 이 엔드포인트 자체가 존재하지 않는 것처럼
  // 고정 404만 반환한다. 계정이 이미 있는지조차 DB 조회로 새면 안 되므로 count()보다
  // 먼저 차단한다. 로컬 next dev(NODE_ENV=development)에서만 기존 셋업 흐름을 쓴다.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const existingCount = await prisma.appUser.count();
  if (existingCount > 0) {
    return NextResponse.json({ errorCode: "accountExists" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (username.length < 3) {
    return NextResponse.json({ errorCode: "usernameTooShort" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ errorCode: "passwordTooShort" }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.appUser.create({
    data: { username, passwordHash },
  });

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ ok: true });
}
