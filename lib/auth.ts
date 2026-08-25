import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** 서버 컴포넌트에서 로그인 여부를 확인하고, 아니면 /login으로 리다이렉트 */
export async function requireUser() {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  return session;
}

/** API 라우트에서 로그인 여부를 확인 (리다이렉트하지 않고 null 반환) */
export async function getAuthedSession() {
  const session = await getSession();
  if (!session.userId) return null;
  return session;
}
