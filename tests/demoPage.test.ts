import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const demoPagePath = new URL("../app/demo/page.tsx", import.meta.url);

describe("public demo security boundary", () => {
  it("does not access the database, session, or management APIs", async () => {
    const source = await readFile(demoPagePath, "utf8");

    expect(source).not.toContain("@/lib/db");
    expect(source).not.toContain("@/lib/session");
    expect(source).not.toContain("@/lib/auth");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain('href="/api/');
  });

  it("clearly identifies all displayed information as fictional", async () => {
    const source = await readFile(demoPagePath, "utf8");

    expect(source).toContain("모든 정보는 가상 데이터입니다");
    expect(source).toContain("DB와 관리 API에 연결되지 않은 정적 데모입니다");
    expect(source).toContain("정부정책 추천 예시");
    expect(source).toContain("실제 자격 판정 아님");
  });
});
