import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";
import { validateBackupFile, validateBackupDecryptable } from "@/lib/backup";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);

  const validated = validateBackupFile(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const decryptable = validateBackupDecryptable(validated.data);
  if (!decryptable.ok) {
    return NextResponse.json({ error: decryptable.error }, { status: 400 });
  }

  const backup = validated.data;

  try {
    await prisma.$transaction(async (tx) => {
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
    });
  } catch {
    return NextResponse.json(
      { error: "복원 중 오류가 발생했습니다. 파일이 손상되었을 수 있습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
