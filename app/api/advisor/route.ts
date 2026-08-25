import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { encryptText, decryptText } from "@/lib/crypto";
import { buildFinancialContext } from "@/lib/financialContext";
import { askFinancialAdvisor, isAdvisorConfigured } from "@/lib/anthropic";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  if (!isAdvisorConfigured()) {
    return NextResponse.json(
      { error: "Anthropic API 키가 설정되지 않아 이 기능을 사용할 수 없습니다." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 2000) {
    return NextResponse.json({ error: "메시지를 1~2000자로 입력해주세요." }, { status: 400 });
  }

  const recentMessages = await prisma.chatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const history = recentMessages
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: decryptText(m.contentEnc) }));

  const context = await buildFinancialContext();

  let reply: string;
  try {
    reply = await askFinancialAdvisor(message, context, history);
  } catch {
    return NextResponse.json(
      { error: "Claude API 호출에 실패했습니다. API 키와 네트워크 상태를 확인해주세요." },
      { status: 502 }
    );
  }

  await prisma.chatMessage.createMany({
    data: [
      { role: "user", contentEnc: encryptText(message) },
      { role: "assistant", contentEnc: encryptText(reply) },
    ],
  });

  return NextResponse.json({ reply });
}

export async function DELETE() {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  await prisma.chatMessage.deleteMany();
  return NextResponse.json({ ok: true });
}
