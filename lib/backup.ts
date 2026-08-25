import { z } from "zod";
import { decryptOptional } from "@/lib/crypto";
import type { Prisma } from "@/app/generated/prisma/client";

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

/**
 * 검증된 백업으로 DB를 대체합니다: 7개 테이블을 모두 지운 뒤 백업 내용으로 다시 채웁니다.
 * import 라우트(app/api/settings/import/route.ts)와 통합 테스트(tests/backup.integration.test.ts)가
 * 이 함수 하나를 공유해서, 테스트가 라우트와 다른 축약 로직을 검증하는 일이 없도록 합니다.
 * 호출자가 prisma.$transaction(tx => restoreBackup(tx, backup))으로 감싸야 트랜잭션이 적용됩니다.
 */
export async function restoreBackup(tx: Prisma.TransactionClient, backup: BackupFile): Promise<void> {
  await tx.chatMessage.deleteMany();
  await tx.assetHistory.deleteMany();
  await tx.cashflowEntry.deleteMany();
  await tx.netWorthSnapshot.deleteMany();
  await tx.loan.deleteMany();
  await tx.asset.deleteMany();
  await tx.userProfile.deleteMany();

  for (const a of backup.assets) {
    await tx.asset.create({
      data: {
        id: a.id,
        category: a.category,
        name: a.name,
        institutionEnc: a.institutionEnc ?? null,
        currentValue: a.currentValue,
        acquiredDate: a.acquiredDate ? new Date(a.acquiredDate) : null,
        memoEnc: a.memoEnc ?? null,
        createdAt: new Date(a.createdAt),
        updatedAt: new Date(a.updatedAt),
      },
    });
  }
  for (const h of backup.assetHistory) {
    await tx.assetHistory.create({
      data: {
        id: h.id,
        assetId: h.assetId,
        value: h.value,
        recordedAt: new Date(h.recordedAt),
        noteEnc: h.noteEnc ?? null,
        createdAt: new Date(h.createdAt),
      },
    });
  }
  for (const l of backup.loans) {
    await tx.loan.create({
      data: {
        id: l.id,
        category: l.category,
        institutionEnc: l.institutionEnc ?? null,
        principal: l.principal,
        balance: l.balance,
        interestRate: l.interestRate,
        rateType: l.rateType,
        repaymentMethod: l.repaymentMethod,
        monthlyPayment: l.monthlyPayment ?? null,
        startDate: new Date(l.startDate),
        maturityDate: new Date(l.maturityDate),
        rateChangeDate: l.rateChangeDate ? new Date(l.rateChangeDate) : null,
        memoEnc: l.memoEnc ?? null,
        createdAt: new Date(l.createdAt),
        updatedAt: new Date(l.updatedAt),
      },
    });
  }
  for (const c of backup.cashflowEntries) {
    await tx.cashflowEntry.create({
      data: {
        id: c.id,
        yearMonth: c.yearMonth,
        type: c.type,
        category: c.category,
        amount: c.amount,
        memoEnc: c.memoEnc ?? null,
        createdAt: new Date(c.createdAt),
      },
    });
  }
  for (const s of backup.netWorthSnapshots) {
    await tx.netWorthSnapshot.create({
      data: {
        id: s.id,
        yearMonth: s.yearMonth,
        totalAssets: s.totalAssets,
        totalLoans: s.totalLoans,
        netWorth: s.netWorth,
        recordedAt: new Date(s.recordedAt),
      },
    });
  }
  for (const m of backup.chatMessages) {
    await tx.chatMessage.create({
      data: {
        id: m.id,
        role: m.role,
        contentEnc: m.contentEnc,
        createdAt: new Date(m.createdAt),
      },
    });
  }
  if (backup.profile) {
    await tx.userProfile.create({
      data: {
        id: backup.profile.id,
        age: backup.profile.age ?? null,
        region: backup.profile.region ?? null,
        householdAnnualIncomeManwon: backup.profile.householdAnnualIncomeManwon ?? null,
        occupation: backup.profile.occupation ?? null,
        householdType: backup.profile.householdType ?? null,
        maritalStatus: backup.profile.maritalStatus ?? null,
        numberOfChildren: backup.profile.numberOfChildren ?? null,
        homeOwnership: backup.profile.homeOwnership ?? null,
      },
    });
  }
}
