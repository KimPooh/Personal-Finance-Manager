import type { PrismaClient } from "@/app/generated/prisma/client";
import { hashPassword } from "@/lib/passwordHash";
import { validateNewAccountCredentials } from "@/lib/authValidation";

// 운영 관리자 계정을 만드는 코어 로직. 공개 HTTP 라우트가 아니라
// scripts/createAdmin.ts(1회성 대화형 CLI)에서만 호출된다.
//
// "공개 setup은 이미 차단되어 있고 소유자가 1회 실행한다"는 전제라도, 값싸게 막을 수
// 있는 동시 생성 경로는 DB 수준에서 막는다: 계정 존재 확인(count)과 생성(create)을
// 하나의 Serializable 트랜잭션으로 묶어, 정말로 두 실행이 겹치면 PostgreSQL이
// 직렬화 오류(40001)로 한쪽을 실패시키게 한다.

export type CreateInitialAdminResult =
  | { ok: true; userId: string }
  | { ok: false; errorCode: "usernameTooShort" | "passwordTooShort" | "accountExists" | "dbError" };

export async function createInitialAdmin(
  prisma: PrismaClient,
  username: string,
  password: string
): Promise<CreateInitialAdminResult> {
  const validation = validateNewAccountCredentials(username, password);
  if (!validation.ok) {
    return { ok: false, errorCode: validation.errorCode };
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.$transaction(
      async (tx) => {
        const existingCount = await tx.appUser.count();
        if (existingCount > 0) {
          // 트랜잭션 내부에서 직접 throw해 커밋을 막는다 - 아래 catch에서
          // 이 표식으로 "이미 계정 존재"와 그 외 진짜 DB 오류를 구분한다.
          throw new AccountAlreadyExistsError();
        }
        return tx.appUser.create({ data: { username, passwordHash } });
      },
      { isolationLevel: "Serializable" }
    );
    return { ok: true, userId: user.id };
  } catch (err) {
    if (err instanceof AccountAlreadyExistsError) {
      return { ok: false, errorCode: "accountExists" };
    }
    // 직렬화 충돌을 포함한 그 외 모든 DB 오류는 세부 내용을 위로 흘려보내지 않고
    // 일반화된 실패로 처리한다 - 호출자(CLI)가 원본 오류를 아이디/비밀번호와 함께
    // 화면에 그대로 출력하는 사고를 구조적으로 막기 위함이다.
    return { ok: false, errorCode: "dbError" };
  }
}

class AccountAlreadyExistsError extends Error {}
