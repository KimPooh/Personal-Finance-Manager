// 정책별 매칭 로직. 사용자가 입력한 프로필과 비교해 "신청 가능성"을 판정합니다.
// 시스템이 정확히 판단할 수 없는 조건(가구원 수에 따른 중위소득, 출산 시점 등)이
// 있는 정책은 최대 '확인 필요'까지만 부여하고 '신청 가능성 높음'으로 단정하지 않습니다.

export type Verdict = "HIGH" | "CHECK" | "LOW";

export interface UserProfileInput {
  age: number | null;
  region: string | null;
  householdAnnualIncomeManwon: number | null;
  occupation: string | null;
  householdType: string | null;
  maritalStatus: string | null;
  numberOfChildren: number | null;
  homeOwnership: string | null; // "NONE" | "OWNS"
}

export interface MatchResult {
  verdict: Verdict;
  reason: string;
}

const UNKNOWN: MatchResult = {
  verdict: "CHECK",
  reason: "프로필 정보가 충분하지 않아 판단할 수 없습니다. 정보를 입력해주세요.",
};

function hasProfile(p: UserProfileInput): boolean {
  return p.age != null || p.householdAnnualIncomeManwon != null || p.homeOwnership != null;
}

type Evaluator = (p: UserProfileInput) => MatchResult;

const EVALUATORS: Record<string, Evaluator> = {
  "geunro-jangryeogeum": (p) => {
    if (!hasProfile(p)) return UNKNOWN;
    if (p.householdAnnualIncomeManwon != null && p.householdAnnualIncomeManwon > 4400) {
      return { verdict: "LOW", reason: "가구 연소득이 근로장려금 상한(약 4,400만원)을 초과합니다." };
    }
    return {
      verdict: "CHECK",
      reason: "가구유형(단독/홑벌이/맞벌이)에 따라 소득 기준이 달라 홈택스 모의계산으로 확인이 필요합니다.",
    };
  },

  "cheongnyeon-naeil-jeochuk": (p) => {
    if (p.age == null) return UNKNOWN;
    if (p.age < 15 || p.age > 39) {
      return { verdict: "LOW", reason: "지원 연령(만 15~39세) 범위 밖입니다." };
    }
    return {
      verdict: "CHECK",
      reason: "연령 조건은 충족하나, 가구소득이 기준 중위소득 50% 이하인지는 가구원 수에 따라 달라 별도 확인이 필요합니다.",
    };
  },

  "cheongnyeon-mirae-jeokgeum": (p) => {
    if (p.age == null) return UNKNOWN;
    if (p.age < 19 || p.age > 34) {
      return { verdict: "LOW", reason: "지원 연령(만 19~34세) 범위 밖입니다." };
    }
    if (p.householdAnnualIncomeManwon != null && p.householdAnnualIncomeManwon > 15000) {
      return { verdict: "LOW", reason: "소득이 지원 기준을 크게 초과하는 것으로 보입니다." };
    }
    return {
      verdict: "CHECK",
      reason: "연령 조건은 충족하나, 개인소득·가구소득(중위소득 200%) 요건은 서민금융진흥원 확인이 필요합니다.",
    };
  },

  "beotimok-jeonse": (p) => {
    if (p.homeOwnership == null && p.householdAnnualIncomeManwon == null) return UNKNOWN;
    if (p.homeOwnership === "OWNS") {
      return { verdict: "LOW", reason: "무주택 세대만 신청 가능한데, 주택을 보유 중인 것으로 입력되었습니다." };
    }
    if (p.householdAnnualIncomeManwon != null) {
      if (p.householdAnnualIncomeManwon <= 5000) {
        return { verdict: "HIGH", reason: "무주택이며 부부합산 연소득이 기본 기준(5천만원) 이하입니다." };
      }
      if (p.householdAnnualIncomeManwon <= 7500) {
        return {
          verdict: "CHECK",
          reason: "신혼·다자녀 등 완화 요건에 해당하면 소득 상한이 최대 7,500만원까지 완화될 수 있어 확인이 필요합니다.",
        };
      }
      return { verdict: "LOW", reason: "부부합산 연소득이 완화 기준(7,500만원)도 초과하는 것으로 보입니다." };
    }
    return { verdict: "CHECK", reason: "무주택 조건은 충족하나 소득 정보가 없어 확인이 필요합니다." };
  },

  "didimdol-loan": (p) => {
    if (p.homeOwnership == null && p.householdAnnualIncomeManwon == null) return UNKNOWN;
    if (p.homeOwnership === "OWNS") {
      return { verdict: "LOW", reason: "무주택 세대만 신청 가능한데, 주택을 보유 중인 것으로 입력되었습니다." };
    }
    if (p.householdAnnualIncomeManwon != null) {
      if (p.householdAnnualIncomeManwon <= 6000) {
        return { verdict: "HIGH", reason: "무주택이며 부부합산 연소득이 기본 기준(6천만원) 이하입니다." };
      }
      if (p.householdAnnualIncomeManwon <= 8500) {
        return {
          verdict: "CHECK",
          reason: "신혼가구 등 완화 요건에 해당하면 소득 상한이 최대 8,500만원까지 완화될 수 있어 확인이 필요합니다.",
        };
      }
      return { verdict: "LOW", reason: "부부합산 연소득이 완화 기준(8,500만원)도 초과하는 것으로 보입니다." };
    }
    return { verdict: "CHECK", reason: "무주택 조건은 충족하나 소득 정보가 없어 확인이 필요합니다." };
  },

  "sinsaeng-teukrye": (p) => {
    if (p.numberOfChildren == null) return UNKNOWN;
    if (p.numberOfChildren < 1) {
      return { verdict: "LOW", reason: "출산·입양 자녀가 없는 것으로 입력되어 대상에 해당하지 않을 가능성이 높습니다." };
    }
    if (p.householdAnnualIncomeManwon != null && p.householdAnnualIncomeManwon > 20000) {
      return { verdict: "LOW", reason: "부부합산 연소득이 완화 기준(최대 2억원)도 초과하는 것으로 보입니다." };
    }
    return {
      verdict: "CHECK",
      reason: "자녀가 있는 것으로 확인되나, '2년 이내 출산/입양' 시점 요건은 시스템이 판단할 수 없어 확인이 필요합니다.",
    };
  },

  "bogeumjari-loan": (p) => {
    if (p.householdAnnualIncomeManwon == null) return UNKNOWN;
    if (p.householdAnnualIncomeManwon <= 7000) {
      return {
        verdict: p.homeOwnership === "OWNS" ? "CHECK" : "HIGH",
        reason:
          p.homeOwnership === "OWNS"
            ? "소득 기준은 충족하나, 1주택자는 처분조건부인 경우에만 가능해 확인이 필요합니다."
            : "무주택이며 부부합산 연소득이 기본 기준(7천만원) 이하입니다.",
      };
    }
    return {
      verdict: "CHECK",
      reason: "다자녀·저소득청년 등 우대금리 조건에 해당하면 완화 적용될 수 있어 확인이 필요합니다.",
    };
  },
};

export function evaluatePolicy(slug: string, profile: UserProfileInput): MatchResult {
  const evaluator = EVALUATORS[slug];
  if (!evaluator) return UNKNOWN;
  return evaluator(profile);
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  HIGH: "신청 가능성 높음",
  CHECK: "확인 필요",
  LOW: "대상 가능성 낮음",
};
