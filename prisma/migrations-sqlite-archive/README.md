# SQLite 마이그레이션 이력 (보관용)

이 폴더는 PostgreSQL 전환 이전, SQLite로 운영되던 시절의 마이그레이션 이력입니다.
**참고용으로만 보존**하며, Prisma CLI가 더 이상 이 폴더를 사용하지 않습니다.

- 재적용 금지: `prisma migrate deploy`/`dev` 대상이 아닙니다. 이 폴더의
  `migration.sql`은 SQLite 방언(예: `PRAGMA`, SQLite 타입 규칙)이라 PostgreSQL에
  그대로 적용할 수 없습니다.
- 활성 마이그레이션 이력은 `prisma/migrations/`(PostgreSQL 방언, 새 계보)를
  참고하세요.
- 이 폴더는 히스토리 확인 용도로만 남겨두었습니다.
