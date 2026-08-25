// 대출 상환 스케줄 및 대출 비교(우선상환) 시뮬레이션.
// 실제 상환 스케줄은 금융회사 계산 방식(단수처리, 수수료 등)에 따라 다를 수 있는
// 추정치이며, 정확한 금액은 해당 금융회사에서 최종 확인해야 합니다.

export interface ScheduleRow {
  period: number;
  principal: number;
  interest: number;
  payment: number;
  remainingBalance: number;
}

export interface LoanForSchedule {
  id: string;
  balance: number;
  interestRate: number; // 연 %
  repaymentMethod: "EQUAL_PRINCIPAL_INTEREST" | "EQUAL_PRINCIPAL" | "BULLET";
  maturityDate: string; // ISO date
}

export function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(1, months);
}

function monthlyRate(annualPct: number): number {
  return annualPct / 100 / 12;
}

/** 원리금균등상환 시 매월 납입액 계산 */
export function equalPaymentAmount(balance: number, annualPct: number, months: number): number {
  const r = monthlyRate(annualPct);
  if (r === 0) return balance / months;
  return (balance * r) / (1 - Math.pow(1 + r, -months));
}

/** 대출 하나의 남은 기간 전체 상환 스케줄 계산 (원금/이자 구분) */
export function buildFullSchedule(loan: LoanForSchedule, now: Date = new Date()): ScheduleRow[] {
  const totalMonths = monthsBetween(now, new Date(loan.maturityDate));
  const r = monthlyRate(loan.interestRate);
  const rows: ScheduleRow[] = [];
  let balance = loan.balance;

  if (loan.repaymentMethod === "BULLET") {
    for (let i = 1; i <= totalMonths; i++) {
      const interest = balance * r;
      const principal = i === totalMonths ? balance : 0;
      rows.push({ period: i, principal, interest, payment: principal + interest, remainingBalance: balance - principal });
      balance -= principal;
    }
    return rows;
  }

  if (loan.repaymentMethod === "EQUAL_PRINCIPAL") {
    const principalPortion = loan.balance / totalMonths;
    for (let i = 1; i <= totalMonths; i++) {
      const interest = balance * r;
      const principal = Math.min(principalPortion, balance);
      rows.push({ period: i, principal, interest, payment: principal + interest, remainingBalance: balance - principal });
      balance -= principal;
    }
    return rows;
  }

  // EQUAL_PRINCIPAL_INTEREST
  const payment = equalPaymentAmount(loan.balance, loan.interestRate, totalMonths);
  for (let i = 1; i <= totalMonths; i++) {
    const interest = balance * r;
    const principal = Math.min(payment - interest, balance);
    rows.push({ period: i, principal, interest, payment: principal + interest, remainingBalance: Math.max(0, balance - principal) });
    balance -= principal;
  }
  return rows;
}

export interface AvalancheResult {
  consideredLoanIds: string[];
  excludedLoanIds: string[];
  baselineTotalInterest: number;
  avalancheTotalInterest: number;
  baselineMonths: number;
  avalancheMonths: number;
  interestSaved: number;
  monthsSaved: number;
}

/**
 * 여유자금을 매달 "금리가 가장 높은 대출"에 우선 투입했을 때와, 그렇지 않고
 * 최소 상환액만 냈을 때의 총 이자를 비교합니다. 만기일시상환(BULLET) 대출은
 * 매월 원금 상환 개념이 없어 이 시뮬레이션에서 제외합니다.
 */
export function simulateAvalanche(
  loans: LoanForSchedule[],
  extraMonthly: number,
  now: Date = new Date()
): AvalancheResult {
  const eligible = loans.filter((l) => l.repaymentMethod !== "BULLET" && l.balance > 0);
  const excluded = loans.filter((l) => l.repaymentMethod === "BULLET" || l.balance <= 0);

  type SimLoan = {
    id: string;
    balance: number;
    rate: number;
    method: LoanForSchedule["repaymentMethod"];
    payment: number; // 고정 최소 납입액(EPI) 또는 초기 원금분(EP)
    principalPortion: number; // EP 전용
  };

  function buildSimLoans(): SimLoan[] {
    return eligible.map((l) => {
      const totalMonths = monthsBetween(now, new Date(l.maturityDate));
      if (l.repaymentMethod === "EQUAL_PRINCIPAL") {
        return {
          id: l.id,
          balance: l.balance,
          rate: l.interestRate,
          method: l.repaymentMethod,
          payment: 0,
          principalPortion: l.balance / totalMonths,
        };
      }
      return {
        id: l.id,
        balance: l.balance,
        rate: l.interestRate,
        method: l.repaymentMethod,
        payment: equalPaymentAmount(l.balance, l.interestRate, totalMonths),
        principalPortion: 0,
      };
    });
  }

  function runSimulation(withExtra: boolean): { totalInterest: number; months: number } {
    const sim = buildSimLoans();
    let totalInterest = 0;
    let month = 0;
    const MAX_MONTHS = 600;

    while (sim.some((l) => l.balance > 0.5) && month < MAX_MONTHS) {
      month++;
      for (const l of sim) {
        if (l.balance <= 0) continue;
        const r = monthlyRate(l.rate);
        const interest = l.balance * r;
        totalInterest += interest;
        const principal =
          l.method === "EQUAL_PRINCIPAL"
            ? Math.min(l.principalPortion, l.balance)
            : Math.min(Math.max(l.payment - interest, 0), l.balance);
        l.balance = Math.max(0, l.balance - principal);
      }

      if (withExtra && extraMonthly > 0) {
        const target = sim.filter((l) => l.balance > 0).sort((a, b) => b.rate - a.rate)[0];
        if (target) {
          const applied = Math.min(extraMonthly, target.balance);
          target.balance -= applied;
        }
      }
    }

    return { totalInterest, months: month };
  }

  const baseline = runSimulation(false);
  const avalanche = runSimulation(true);

  return {
    consideredLoanIds: eligible.map((l) => l.id),
    excludedLoanIds: excluded.map((l) => l.id),
    baselineTotalInterest: baseline.totalInterest,
    avalancheTotalInterest: avalanche.totalInterest,
    baselineMonths: baseline.months,
    avalancheMonths: avalanche.months,
    interestSaved: Math.max(0, baseline.totalInterest - avalanche.totalInterest),
    monthsSaved: Math.max(0, baseline.months - avalanche.months),
  };
}
