import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthedSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getAuthedSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !Array.isArray(body.assets)) {
    return NextResponse.json({ error: "백업 파일 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.deleteMany();
      await tx.assetHistory.deleteMany();
      await tx.cashflowEntry.deleteMany();
      await tx.netWorthSnapshot.deleteMany();
      await tx.loan.deleteMany();
      await tx.asset.deleteMany();
      await tx.userProfile.deleteMany();

      for (const a of body.assets ?? []) {
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
      for (const h of body.assetHistory ?? []) {
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
      for (const l of body.loans ?? []) {
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
      for (const c of body.cashflowEntries ?? []) {
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
      for (const s of body.netWorthSnapshots ?? []) {
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
      for (const m of body.chatMessages ?? []) {
        await tx.chatMessage.create({
          data: {
            id: m.id,
            role: m.role,
            contentEnc: m.contentEnc,
            createdAt: new Date(m.createdAt),
          },
        });
      }
      if (body.profile) {
        await tx.userProfile.create({
          data: {
            id: body.profile.id,
            age: body.profile.age ?? null,
            region: body.profile.region ?? null,
            householdAnnualIncomeManwon: body.profile.householdAnnualIncomeManwon ?? null,
            occupation: body.profile.occupation ?? null,
            householdType: body.profile.householdType ?? null,
            maritalStatus: body.profile.maritalStatus ?? null,
            numberOfChildren: body.profile.numberOfChildren ?? null,
            homeOwnership: body.profile.homeOwnership ?? null,
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
