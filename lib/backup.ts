import { z } from "zod";
import { decryptOptional } from "@/lib/crypto";

// 백업 레코드는 실서비스 입력 폼(lib/validation.ts)과 달리 DB에 저장된 형태(암호화된 *Enc
// 필드, id/createdAt 등)를 그대로 다룹니다. category/type 같은 코드값은 과거 버전 백업이
// 최신 앱에서도 복원되도록 일부러 enum이 아닌 비어있지 않은 문자열로만 검증합니다.

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "날짜 형식이 올바르지 않습니다.",
});

const backupAssetSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  institutionEnc: z.string().nullable().optional(),
  currentValue: z.number().finite(),
  acquiredDate: isoDateString.nullable().optional(),
  memoEnc: z.string().nullable().optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const backupAssetHistorySchema = z.object({
  id: z.string().min(1),
  assetId: z.string().min(1),
  value: z.number().finite(),
  recordedAt: isoDateString,
  noteEnc: z.string().nullable().optional(),
  createdAt: isoDateString,
});

const backupLoanSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  institutionEnc: z.string().nullable().optional(),
  principal: z.number().finite(),
  balance: z.number().finite(),
  interestRate: z.number().finite(),
  rateType: z.string().min(1),
  repaymentMethod: z.string().min(1),
  monthlyPayment: z.number().finite().nullable().optional(),
  startDate: isoDateString,
  maturityDate: isoDateString,
  rateChangeDate: isoDateString.nullable().optional(),
  memoEnc: z.string().nullable().optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

const backupCashflowEntrySchema = z.object({
  id: z.string().min(1),
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth 형식이 올바르지 않습니다."),
  type: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().finite(),
  memoEnc: z.string().nullable().optional(),
  createdAt: isoDateString,
});

const backupNetWorthSnapshotSchema = z.object({
  id: z.string().min(1),
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "yearMonth 형식이 올바르지 않습니다."),
  totalAssets: z.number().finite(),
  totalLoans: z.number().finite(),
  netWorth: z.number().finite(),
  recordedAt: isoDateString,
});

const backupChatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  contentEnc: z.string().min(1),
  createdAt: isoDateString,
});

const backupProfileSchema = z.object({
  id: z.string().min(1),
  age: z.number().int().nullable().optional(),
  region: z.string().nullable().optional(),
  householdAnnualIncomeManwon: z.number().int().nullable().optional(),
  occupation: z.string().nullable().optional(),
  householdType: z.string().nullable().optional(),
  maritalStatus: z.string().nullable().optional(),
  numberOfChildren: z.number().int().nullable().optional(),
  homeOwnership: z.string().nullable().optional(),
});

export const backupFileSchema = z.object({
  formatVersion: z.literal(1, { error: "지원하지 않는 백업 형식 버전입니다." }),
  assets: z.array(backupAssetSchema),
  assetHistory: z.array(backupAssetHistorySchema),
  loans: z.array(backupLoanSchema),
  cashflowEntries: z.array(backupCashflowEntrySchema),
  netWorthSnapshots: z.array(backupNetWorthSnapshotSchema),
  chatMessages: z.array(backupChatMessageSchema),
  profile: backupProfileSchema.nullable().optional(),
});

export type BackupFile = z.infer<typeof backupFileSchema>;

export type BackupValidationResult =
  | { ok: true; data: BackupFile }
  | { ok: false; error: string };

/** 백업 JSON의 전체 구조와 각 레코드 형식을 검증합니다 (DB 접근 없음). */
export function validateBackupFile(body: unknown): BackupValidationResult {
  const parsed = backupFileSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "백업 파일 형식이 올바르지 않습니다.",
    };
  }
  return { ok: true, data: parsed.data };
}

export type BackupDecryptabilityResult = { ok: true } | { ok: false; error: string };

/**
 * 백업에 포함된 모든 암호화 필드(*Enc)가 현재 ENCRYPTION_KEY로 복호화 가능한지 미리 확인합니다.
 * 다른 키로 만든 백업을 복원하면 이후 화면 렌더링 중(try/catch 없이 decryptOptional을 호출하는
 * 자산/대출/현금흐름/이력/AI상담 페이지)에서야 예외가 나므로, DB를 건드리기 전에 여기서 막습니다.
 */
export function validateBackupDecryptable(data: BackupFile): BackupDecryptabilityResult {
  const encFields: (string | null | undefined)[] = [];
  for (const a of data.assets) encFields.push(a.institutionEnc, a.memoEnc);
  for (const h of data.assetHistory) encFields.push(h.noteEnc);
  for (const l of data.loans) encFields.push(l.institutionEnc, l.memoEnc);
  for (const c of data.cashflowEntries) encFields.push(c.memoEnc);
  for (const m of data.chatMessages) encFields.push(m.contentEnc);

  for (const enc of encFields) {
    if (enc == null) continue;
    try {
      decryptOptional(enc);
    } catch {
      return {
        ok: false,
        error:
          "백업 파일을 복호화할 수 없습니다. 이 앱과 다른 암호화 키(ENCRYPTION_KEY)로 만든 백업일 수 있습니다.",
      };
    }
  }
  return { ok: true };
}
