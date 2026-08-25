import { describe, expect, it } from "vitest";
import { evaluatePolicy, type UserProfileInput } from "@/lib/policyMatching";

const emptyProfile: UserProfileInput = {
  age: null,
  region: null,
  householdAnnualIncomeManwon: null,
  occupation: null,
  householdType: null,
  maritalStatus: null,
  numberOfChildren: null,
  homeOwnership: null,
};

describe("정책 매칭", () => {
  it("알 수 없는 정책이나 빈 프로필은 확인 필요로 판정한다", () => {
    expect(evaluatePolicy("unknown", emptyProfile).verdict).toBe("CHECK");
    expect(evaluatePolicy("beotimok-jeonse", emptyProfile).verdict).toBe("CHECK");
  });

  it("유주택자는 버팀목 전세대출 가능성을 낮게 판정한다", () => {
    expect(evaluatePolicy("beotimok-jeonse", { ...emptyProfile, homeOwnership: "OWNS" }).verdict).toBe("LOW");
  });

  it("무주택·기준 이하 소득은 버팀목 전세대출 가능성을 높게 판정한다", () => {
    expect(
      evaluatePolicy("beotimok-jeonse", {
        ...emptyProfile,
        homeOwnership: "NONE",
        householdAnnualIncomeManwon: 4_500,
      }).verdict
    ).toBe("HIGH");
  });

  it("청년 정책의 연령 경계를 적용한다", () => {
    expect(evaluatePolicy("cheongnyeon-mirae-jeokgeum", { ...emptyProfile, age: 18 }).verdict).toBe("LOW");
    expect(evaluatePolicy("cheongnyeon-mirae-jeokgeum", { ...emptyProfile, age: 19 }).verdict).toBe("CHECK");
    expect(evaluatePolicy("cheongnyeon-mirae-jeokgeum", { ...emptyProfile, age: 35 }).verdict).toBe("LOW");
  });
});
