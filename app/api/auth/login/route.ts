import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const rateLimitKey = `login:${username || "unknown"}`;
  const { allowed, remainingMs } = checkRateLimit(rateLimitKey);
  if (!allowed) {
    const minutes = Math.ceil(remainingMs / 60000);
    return NextResponse.json(
      { errorCode: "tooManyAttempts", errorVars: { minutes } },
      { status: 429 }
    );
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    recordFailedAttempt(rateLimitKey);
    return NextResponse.json({ errorCode: "invalidCredentials" }, { status: 401 });
  }

  clearRateLimit(rateLimitKey);

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ ok: true });
}
