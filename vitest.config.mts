import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
    // 기본 5000ms는 실제 네트워크 왕복이 필요한 Neon 통합 테스트
    // (tests/backup.integration.test.ts, tests/csvImportRoutes.test.ts)에는
    // 너무 짧다 - 상한만 올리는 것이라 순수 단위 테스트 속도에는 영향이 없다.
    testTimeout: 30000,
  },
});
