import { NextResponse } from "next/server";
import { getAuthedSession } from "@/lib/auth";
import { buildFinancialContext } from "@/lib/financialContext";

export async function GET() {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const context = await buildFinancialContext();
  return NextResponse.json(context);
}
