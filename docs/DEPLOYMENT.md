# 배포 runbook (Vercel + Neon PostgreSQL)

이 문서는 개인자산관리 앱을 Vercel + Neon PostgreSQL로 배포하고, 기존 로컬 데이터를
안전하게 이전하기 위한 절차서입니다. **이 문서는 계획 문서이며, 실제 마이그레이션·
관리자 생성·데이터 복원·Vercel 배포는 아직 실행하지 않았습니다.** 각 단계는 별도
승인을 받은 뒤 Codex와 함께 진행합니다.

실제 비밀번호, 연결 문자열, 호스트명, API 키 등은 이 문서 어디에도 적지 않습니다 -
환경변수 **이름**과 그 의미만 설명합니다.

## 0. 전제

- 이 프로젝트의 목표는 **개인 실사용 + 포트폴리오 전시용**입니다. 상용화·결제·구독·
  다중 사용자·은행 API 자동연동은 범위에서 제외합니다.
- 완료 기준: PostgreSQL 배포 준비 → Vercel 배포 → 갤럭시 실기기 최종 검증 →
  포트폴리오 배포 링크 연결.
- 공개 회원가입(`/api/setup`, `/setup`)은 이미 production(`NODE_ENV=production`)에서
  DB 조회 전에 고정 404로 차단되어 있습니다(커밋 98b9207). 그렇더라도 아래 실행
  순서는 관리자 계정이 존재하기 전에 배포를 굳이 공개하지 않는 방향으로 정렬합니다.

## 1. 환경별 필수 환경변수

값은 절대 이 문서에 적지 않습니다. Vercel 프로젝트 설정의 Environment Variables에서
Production/Preview를 구분해 등록하고, 로컬은 `.env`(이미 gitignore 대상)를 그대로
씁니다.

| 변수 | Production | Preview | 로컬(.env) | 설명 |
|---|---|---|---|---|
| `DATABASE_URL` | 필수 (Neon production 브랜치) | 필수 (Neon dev/preview 브랜치, production과 분리) | 필수 | Prisma가 사용하는 PostgreSQL 연결 문자열 |
| `ENCRYPTION_KEY` | 필수, **로컬에서 이미 쓰던 것과 동일한 키를 그대로 사용** | 필수, **Production과 다른 별도 키** | 필수 (기존 값 그대로) | 필드 단위 AES-256-GCM 암호화 키 (64자리 hex). Production이 로컬과 같은 키를 유지해야 아래 4장의 백업 복원이 정상 동작합니다. Preview는 실제 데이터/백업을 절대 주입하지 않으므로 별도 키를 씁니다 |
| `SESSION_SECRET` | 필수 | 필수 | 필수 (기존 값 그대로) | iron-session 쿠키 암호화 키 (32자 이상) |
| `SESSION_COOKIE_SECURE` | **설정하지 않음** | **설정하지 않음** | 미설정 또는 필요 시 `false` | `lib/session.ts`가 `NODE_ENV=production`에서 자동으로 secure 쿠키를 켠다(`secure: NODE_ENV === "production" && SESSION_COOKIE_SECURE !== "false"`). Vercel Production/Preview는 항상 HTTPS이므로 이 변수를 아예 설정하지 않는 것이 기본이며 맞다. 로컬에서 HTTPS 없이 `next build && next start`로 프로덕션 빌드를 테스트해야 할 때만 예외적으로 `false`로 켜는 값이다 |
| `ANTHROPIC_API_KEY` | 선택 (Claude 재무상담 기능용) | 선택 | 선택 | 없으면 상담 메뉴가 안내 문구만 표시하고 비활성 |
| `ANTHROPIC_MODEL` | 선택 (기본값 `claude-sonnet-5`) | 선택 | 선택 | 미설정 시 코드 기본값 사용 |
| `TEST_DATABASE_URL` | **설정 금지** | **설정 금지** | 선택 (통합 테스트용) | Neon test 브랜치 전용. Vercel Production/Preview에는 절대 넣지 않는다 - 로컬/CI에서 `npm test` 라이브 검증에만 쓴다 |
| `ALLOW_DESTRUCTIVE_DB_TESTS` | **설정 금지** | **설정 금지** | 선택 (`true`, 통합 테스트용) | `TEST_DATABASE_URL`과 짝을 이루는 명시적 opt-in 플래그. 마찬가지로 Vercel에는 넣지 않는다 |

## 2. 배포 실행 순서

아래는 owner가 승인 후 Codex와 함께 순서대로 진행할 절차입니다. 이 문서 작성
시점에는 **하나도 실행하지 않았습니다.**

1. **Neon production 브랜치 확인**: 이미 존재하는지 확인하고, 없으면 별도 승인 후
   생성합니다.
2. **Vercel 환경변수 설정**: 위 1장 표대로 Production/Preview에 각각 등록합니다.
3. **Production DB에 마이그레이션 적용**: `prisma/migrations/`의 전체 이력
   (SQLite 시절 이력은 `prisma/migrations-sqlite-archive/`에 보존, 재적용
   대상 아님)을 production Neon 브랜치에 적용합니다.
   - ⚠️ **아직 정확한 실행 커맨드를 확정하지 않았습니다.** `npx prisma migrate
     deploy`는 기본적으로 `process.env.DATABASE_URL`(또는 Prisma가 자동으로
     읽는 `.env`)을 사용하는데, 이는 fc37467에서 관리자 CLI에 대해 발견·수정한
     것과 **동일한 종류의 위험**(부모 셸에 이미 다른 `DATABASE_URL`이 남아있으면
     조용히 잘못된 DB에 적용될 수 있음)을 그대로 안고 있습니다. 이 단계의 실제
     실행 커맨드는, `.env.production.local`만 명시적으로 쓰고 셸에 상속된
     `DATABASE_URL`을 절대 참조하지 않는 Windows-safe 방법을 Codex와 함께 확정한
     뒤에만 진행합니다. 확정 전까지는 어떤 구체적인 커맨드도 여기 단정적으로
     적지 않습니다.
4. **관리자 계정 생성**: `npm run create-admin`(d2f4553/fc37467에서 만든 CLI)을
   로컬에서 production `.env.production.local`로 실행합니다. **이 단계에서
   owner가 비밀번호 마스킹이 실제 화면에서 정상 동작하는지 육안으로 직접 확인**
   합니다(이 하네스는 non-interactive stdin이라 자동 검증이 불가능했던 부분).
   완료 후 `.env.production.local`을 즉시 삭제합니다.
5. **Vercel 배포**: 이 시점에는 이미 관리자 계정이 있으므로, 배포 직후에도
   공개 상태로 "관리자 없음" 창이 생기지 않습니다.
6. **로그인 확인**: 배포된 URL에서 방금 만든 관리자 계정으로 실제 로그인해
   봅니다.
7. **백업 복원** (기존 데이터를 유지하고 싶은 경우에만, 아래 4장 절차 참고).
8. **데이터 검증** (아래 5장 체크리스트).
9. **갤럭시 실기기 최종 검증**: 실사용자의 안드로이드 갤럭시 폰에서 로그인 ·
   CSV/엑셀 업로드 · 핵심 기능을 확인합니다.
10. **포트폴리오 배포 링크 연결**: 포트폴리오 사이트(`KimPooh/portfolio-site`)의
    이 앱 케이스 스터디에 실제 배포 URL을 연결합니다.

## 3. 데이터 이전 절차

**중요**: 현재 HEAD는 PostgreSQL 전용입니다(`lib/db.ts`가 `PrismaNeon` 어댑터만
사용). 예전 SQLite `dev.db` 파일을 **지금 코드로는 직접 읽을 수 없습니다.**

- **이미 내보낸 백업 JSON 파일이 있다면**: 그 파일을 그대로 사용해 5번 실행 순서의
  "백업 복원" 단계로 갑니다.
- **백업 파일이 없다면**: 보존된 `dev.db`와 **SQLite 시절 코드**(PostgreSQL 전환
  커밋 e8f47a4 이전 - `git log`로 정확한 커밋을 찾습니다)를 임시로 checkout해
  그 상태의 앱을 `dev.db`에 연결해 실행한 뒤, 그 시절 `/api/settings/export`로
  백업 JSON을 먼저 만드는 **별도 절차**가 필요합니다. 이 절차는 이번 계획 범위
  밖이며, 필요 시 별도로 상세 절차를 작성합니다.
- 백업은 `ENCRYPTION_KEY`로 암호화된 필드를 그대로 담고 있어, **내보낼 때 쓰인
  것과 같은 `ENCRYPTION_KEY`를 쓰는 환경에서만** 복원 가능합니다 - 1장에서
  Production이 로컬과 동일한 키를 유지하기로 한 이유입니다.
- **원본 `dev.db` 파일과 내보낸 백업 파일은 production 복원 검증이 끝나기 전까지
  삭제·수정 금지**입니다.

## 4. 복원 후 데이터 검증 체크리스트

production 복원 직후 아래를 확인합니다:

- [ ] Asset(자산) 항목 수가 백업/원본과 일치하는가
- [ ] Loan(대출) 항목 수가 일치하는가
- [ ] CashflowEntry(현금흐름) 항목 수가 일치하는가
- [ ] UserProfile(프로필)이 정상 복원되었는가
- [ ] CsvImportRecord 항목 수가 일치하는가 (구버전 백업이라 이 필드가 없었다면
  빈 배열로 정상 처리되는지도 확인 - `lib/backup.ts`가 이미 이 케이스를 다룸)
- [ ] 암호화 필드(기관명·메모 등) 몇 건을 실제로 열어 복호화된 원문이 깨지지
  않고 정상 표시되는지 확인 (같은 `ENCRYPTION_KEY`를 쓰고 있는지의 최종 확인)

**하나라도 실패하면**: production DB를 임의로 삭제·초기화하지 않습니다. 원본
`dev.db`와 백업 파일을 그대로 보존한 채 작업을 중단하고, 실패 내용을
`.agents/handoff/claude-to-codex.md`에 기록한 뒤 다음 단계를 다시 상의합니다.

## 5. 문제 발생 시 대응 (초안)

- 마이그레이션 실패: production DB를 되돌리려 하지 말고 즉시 중단, 어떤 마이그레이션
  단계에서 실패했는지 기록 후 상의.
- 관리자 생성 실패: `createInitialAdmin`은 실패해도 계정을 만들지 않으므로
  (`lib/adminSetup.ts`의 Serializable 트랜잭션), 그냥 `npm run create-admin`을
  다시 실행하면 됩니다.
- 배포 후 로그인 불가: 세션 관련 환경변수(`SESSION_SECRET`)가 Vercel에 정상
  등록됐는지부터 확인.
- 상세 대응 절차는 실제 배포 단계에 가까워지면 더 구체화합니다.

## 6. 이미 확립된 보안 수칙 요약

- `.env.production.local`은 관리자 생성 직후 즉시 삭제 (fc37467).
- 비밀번호·연결 문자열·암호화 키는 커밋·로그·`.agents/handoff/*.md` 어디에도
  기록하지 않습니다 (이 프로젝트 전체의 표준 규칙).
- `TEST_DATABASE_URL`/`ALLOW_DESTRUCTIVE_DB_TESTS`는 로컬/CI 전용, Vercel에는
  절대 넣지 않습니다 (1장 표).
- 공개 setup은 production에서 이미 차단되어 있습니다 (98b9207).
