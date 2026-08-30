import bcrypt from "bcryptjs";

// bcryptjs에만 의존하는 순수 비밀번호 해싱 유틸리티. lib/auth.ts와 분리한 이유:
// lib/auth.ts는 next/navigation·@/lib/session(SESSION_SECRET 필요)까지 임포트하므로,
// 세션/HTTP 요청 맥락이 없는 scripts/createAdmin.ts(운영 관리자 생성 CLI) 같은
// 곳에서 해싱만 쓰고 싶을 때도 SESSION_SECRET이 없으면 모듈 로드 자체가 실패하는
// 문제가 있었다(--help처럼 DB도 세션도 필요 없는 경로까지 막힘).

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
