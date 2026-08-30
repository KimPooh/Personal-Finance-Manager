// app/api/setup/route.ts와 lib/adminSetup.ts(운영 관리자 생성 CLI)가 공유하는 계정
// 생성 검증 규칙. 두 곳에서 아이디/비밀번호 최소 길이가 각자 따로 정의되어 드리프트
// 나는 것을 막기 위해 하나로 뽑았다.

export const MIN_USERNAME_LENGTH = 3;
export const MIN_PASSWORD_LENGTH = 8;

export type CredentialValidationResult =
  | { ok: true }
  | { ok: false; errorCode: "usernameTooShort" | "passwordTooShort" };

export function validateNewAccountCredentials(
  username: string,
  password: string
): CredentialValidationResult {
  if (username.length < MIN_USERNAME_LENGTH) {
    return { ok: false, errorCode: "usernameTooShort" };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, errorCode: "passwordTooShort" };
  }
  return { ok: true };
}
