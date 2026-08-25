import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
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
