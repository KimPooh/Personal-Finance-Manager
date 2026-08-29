import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { getClientIp } from "@/lib/clientIp";
import {
  checkLoginRateLimit,
  cleanupExpiredRateLimitBuckets,
  clearUsernameRateLimit,
  recordLoginFailure,
} from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = getClientIp(req);

  await cleanupExpiredRateLimitBuckets(prisma);

  const rateLimitCheck = await checkLoginRateLimit(prisma, username, ip);
  if (rateLimitCheck.outcome === "dbError") {
    return NextResponse.json({ errorCode: "serviceUnavailable" }, { status: 503 });
  }
  if (rateLimitCheck.outcome === "blocked") {
    const minutes = Math.ceil(rateLimitCheck.remainingMs / 60000);
    return NextResponse.json(
      { errorCode: "tooManyAttempts", errorVars: { minutes } },
      { status: 429 }
    );
  }

  const user = await prisma.appUser.findUnique({ where: { username } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    const { dbError } = await recordLoginFailure(prisma, username, ip);
    if (dbError) {
      return NextResponse.json({ errorCode: "serviceUnavailable" }, { status: 503 });
    }
    return NextResponse.json({ errorCode: "invalidCredentials" }, { status: 401 });
  }

  await clearUsernameRateLimit(prisma, username);

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  await session.save();

  return NextResponse.json({ ok: true });
}
