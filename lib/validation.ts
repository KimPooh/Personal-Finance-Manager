import { z } from "zod";

export const assetInputSchema = z.object({
  category: z.enum([
    "DEPOSIT",
    "SAVINGS",
    "HOUSING_SUBSCRIPTION",
    "STOCK",
    "ETF",
    "CRYPTO",
    "PENSION",
    "REAL_ESTATE",
    "CAR",
    "OTHER",
  ]),
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100),
  currentValue: z.number().finite().min(0, "0 이상이어야 합니다."),
  acquiredDate: z.string().trim().optional().nullable(),
  institution: z.string().trim().max(100).optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
});

export type AssetInput = z.infer<typeof assetInputSchema>;

export const loanInputSchema = z.object({
  category: z.enum(["CREDIT", "OVERDRAFT", "MORTGAGE", "JEONSE", "STUDENT", "CARD_LOAN", "OTHER"]),
  institution: z.string().trim().max(100).optional().nullable(),
  principal: z.number().finite().min(0),
  balance: z.number().finite().min(0),
  interestRate: z.number().finite().min(0).max(100),
  rateType: z.enum(["FIXED", "VARIABLE"]),
  repaymentMethod: z.enum(["EQUAL_PRINCIPAL_INTEREST", "EQUAL_PRINCIPAL", "BULLET"]),
  monthlyPayment: z.number().finite().min(0).optional().nullable(),
  startDate: z.string().trim().min(1, "실행일을 입력해주세요."),
  maturityDate: z.string().trim().min(1, "만기일을 입력해주세요."),
  rateChangeDate: z.string().trim().optional().nullable(),
  memo: z.string().trim().max(500).optional().nullable(),
});

export type LoanInput = z.infer<typeof loanInputSchema>;

export const cashflowInputSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM 형식이어야 합니다."),
  type: z.enum(["INCOME", "FIXED_EXPENSE", "VARIABLE_EXPENSE"]),
  category: z.string().trim().min(1).max(50),
  amount: z.number().finite().min(0),
  memo: z.string().trim().max(300).optional().nullable(),
});

export type CashflowInput = z.infer<typeof cashflowInputSchema>;

export const cashflowCopyPreviousInputSchema = z.object({
  targetMonth: z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM 형식이어야 합니다."),
});

export type CashflowCopyPreviousInput = z.infer<typeof cashflowCopyPreviousInputSchema>;

export const userProfileInputSchema = z.object({
  age: z.number().int().min(0).max(120).optional().nullable(),
  region: z.string().trim().max(20).optional().nullable(),
  householdAnnualIncomeManwon: z.number().int().min(0).max(1000000).optional().nullable(),
  occupation: z.string().trim().max(30).optional().nullable(),
  householdType: z.string().trim().max(30).optional().nullable(),
  maritalStatus: z.string().trim().max(10).optional().nullable(),
  numberOfChildren: z.number().int().min(0).max(20).optional().nullable(),
  homeOwnership: z.enum(["NONE", "OWNS"]).optional().nullable(),
});

export type UserProfileFormInput = z.infer<typeof userProfileInputSchema>;
