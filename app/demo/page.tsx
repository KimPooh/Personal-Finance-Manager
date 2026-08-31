import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "공개 데모 | 개인 자산관리",
  description: "가상 데이터로 살펴보는 개인 자산관리 포트폴리오 데모",
};

const assets = [
  { category: "예금", name: "생활비 통장", institution: "카카오뱅크", value: "₩8,500,000", color: "bg-sky-500" },
  { category: "적금", name: "내 집 마련 적금", institution: "신한은행", value: "₩12,000,000", color: "bg-emerald-500" },
  { category: "ETF", name: "KODEX 200", institution: "미래에셋증권", value: "₩15,300,000", color: "bg-violet-500" },
  { category: "청약저축", name: "주택청약종합저축", institution: "국민은행", value: "₩7,000,000", color: "bg-amber-500" },
] as const;

const cashflow = [
  { label: "근로소득", amount: "+ ₩4,200,000", tone: "text-emerald-600" },
  { label: "월세·관리비", amount: "- ₩850,000", tone: "text-red-500" },
  { label: "생활비", amount: "- ₩920,000", tone: "text-red-500" },
  { label: "대출 상환", amount: "- ₩620,000", tone: "text-red-500" },
] as const;

const policyExamples = [
  { title: "청년도약계좌", category: "자산형성", reason: "청년 연령대와 근로소득 조건을 기준으로 살펴볼 수 있는 예시입니다.", badge: "조건 확인 필요" },
  { title: "청년월세 지원", category: "주거지원", reason: "무주택·임차 가구가 확인할 수 있는 주거비 지원 예시입니다.", badge: "신청기간 확인" },
  { title: "내집마련 디딤돌대출", category: "주택금융", reason: "소득과 주택가격 조건에 따라 검토할 수 있는 정책대출 예시입니다.", badge: "자격 확인 필요" },
] as const;

function DemoBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
      <span aria-hidden="true">✓</span>
      포트폴리오 공개 데모 · 모든 정보는 가상 데이터입니다
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone = "text-slate-900",
}: {
  icon: string;
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className={`mt-2 text-2xl font-bold ${tone}`}>{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-lg text-indigo-600" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{hint}</p>
    </article>
  );
}

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-slate-50 pb-24 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-base font-bold">개인 자산관리</p>
            <p className="text-xs text-slate-400">금융을 몰라도 시작할 수 있는 자산관리</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              개인용 앱 로그인
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <DemoBadge />
        <section className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold text-indigo-600">2026년 8월 예시</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">내 돈의 흐름을 한눈에</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">자산, 대출, 월 현금흐름과 상환 계획을 한곳에서 이해할 수 있도록 구성한 읽기 전용 데모입니다.</p>
          </div>
          <a href="#assets" className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">
            데모 둘러보기 <span aria-hidden="true">→</span>
          </a>
        </section>

        <section aria-label="재무 요약" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon="▣" label="총자산" value="₩42,800,000" hint="예금·적금·투자·청약 합계" />
          <SummaryCard icon="🏦" label="대출잔액" value="₩18,500,000" hint="현재 갚아야 할 원금" tone="text-red-600" />
          <SummaryCard icon="↗" label="순자산" value="₩24,300,000" hint="총자산에서 대출을 뺀 금액" tone="text-emerald-600" />
          <SummaryCard icon="₩" label="월 잉여자금" value="₩1,810,000" hint="소득에서 지출과 상환액을 뺀 금액" tone="text-indigo-600" />
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
          <section id="assets" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-xs font-semibold text-indigo-600">ASSETS</p><h2 className="mt-1 text-xl font-bold">보유 자산</h2></div>
              <span className="text-sm font-semibold text-slate-500">총 ₩42,800,000</span>
            </div>
            <div className="mt-5 space-y-3">
              {assets.map((asset) => (
                <article key={asset.name} className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-3 w-3 shrink-0 rounded-full ${asset.color}`} aria-hidden="true" />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{asset.name}</p><p className="mt-1 text-xs text-slate-400">{asset.category} · {asset.institution}</p></div>
                  </div>
                  <p className="shrink-0 text-sm font-bold">{asset.value}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="loans" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div><p className="text-xs font-semibold text-indigo-600">ALLOCATION</p><h2 className="mt-1 text-xl font-bold">자산 구성</h2></div>
            <div className="mt-8 flex h-4 overflow-hidden rounded-full bg-slate-100"><span className="w-[28%] bg-sky-500" /><span className="w-[20%] bg-emerald-500" /><span className="w-[36%] bg-violet-500" /><span className="w-[16%] bg-amber-500" /></div>
            <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
              {[['예금', '20%'], ['적금', '28%'], ['ETF', '36%'], ['청약', '16%']].map(([label, value], index) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-bold">{value}</p><span className={`mt-2 block h-1.5 rounded-full ${assets[index].color}`} /></div>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section id="cashflow" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-lg text-red-500" aria-hidden="true">🏦</span><div><p className="text-xs font-semibold text-red-500">LOAN</p><h2 className="text-xl font-bold">주택담보대출</h2></div></div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-slate-400">남은 잔액</dt><dd className="mt-1 font-bold">₩18,500,000</dd></div>
              <div><dt className="text-slate-400">금리</dt><dd className="mt-1 font-bold">연 3.8% · 변동</dd></div>
              <div><dt className="text-slate-400">월 상환액</dt><dd className="mt-1 font-bold">₩620,000</dd></div>
              <div><dt className="text-slate-400">만기일</dt><dd className="mt-1 font-bold">2029.08.25</dd></div>
            </dl>
            <div className="mt-6 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800"><p className="font-semibold">원리금균등상환</p><p className="mt-1 leading-6 text-indigo-600">매달 원금과 이자를 합친 금액을 비슷하게 납부하는 방식입니다.</p></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-lg text-emerald-600" aria-hidden="true">₩</span><div><p className="text-xs font-semibold text-emerald-600">CASH FLOW</p><h2 className="text-xl font-bold">이번 달 현금흐름</h2></div></div>
            <div className="mt-5 divide-y divide-slate-100">
              {cashflow.map((item) => <div key={item.label} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-500">{item.label}</span><span className={`font-bold ${item.tone}`}>{item.amount}</span></div>)}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-900 p-4 text-white"><span className="text-sm text-slate-300">이번 달 남는 금액</span><span className="font-bold">₩1,810,000</span></div>
          </section>
        </div>

        <section id="repayment" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-lg text-amber-600" aria-hidden="true">▦</span><div><p className="text-xs font-semibold text-amber-600">REPAYMENT PLAN</p><h2 className="text-xl font-bold">다가오는 상환 일정</h2></div></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">읽기 전용 미리보기</span></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[['9월', '₩620,000', '원금 ₩561,417 · 이자 ₩58,583'], ['10월', '₩620,000', '원금 ₩563,195 · 이자 ₩56,805'], ['11월', '₩620,000', '원금 ₩564,979 · 이자 ₩55,021']].map(([month, payment, detail]) => <article key={month} className="rounded-xl border border-slate-100 bg-slate-50 p-4"><p className="text-xs font-semibold text-slate-400">{month} 납입</p><p className="mt-2 text-lg font-bold">{payment}</p><p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p></article>)}
          </div>
        </section>

        <section id="policies" className="mt-6 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-semibold text-teal-600">POLICY MATCHING</p><h2 className="mt-1 text-xl font-bold">정부정책 추천 예시</h2><p className="mt-2 text-sm leading-6 text-slate-500">가상의 프로필 조건을 기준으로 어떤 정책을 확인할 수 있는지 보여주는 데모입니다.</p></div>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">실제 자격 판정 아님</span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {policyExamples.map((policy) => (
              <article key={policy.title} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-teal-600">{policy.category}</span><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">{policy.badge}</span></div>
                <h3 className="mt-4 text-base font-bold">{policy.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-500">{policy.reason}</p>
                <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-400">지원 조건과 신청기간은 정부 공식 공고에서 다시 확인해야 합니다.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl bg-slate-900 px-5 py-7 text-white sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-7">
          <div className="flex items-start gap-3"><span className="mt-0.5 shrink-0 text-indigo-300" aria-hidden="true">●</span><div><h2 className="font-bold">실제 개인 데이터는 보호됩니다</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">이 페이지는 DB와 관리 API에 연결되지 않은 정적 데모입니다. 추가·수정·삭제·백업 기능은 로그인한 관리자에게만 제공됩니다.</p></div></div>
          <Link href="/login" className="mt-5 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 sm:mt-0">개인용 앱 로그인 <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <nav aria-label="데모 섹션" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <a href="#assets" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-indigo-600"><span className="text-base" aria-hidden="true">▣</span>자산</a>
        <a href="#loans" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500"><span className="text-base" aria-hidden="true">🏦</span>대출</a>
        <a href="#cashflow" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500"><span className="text-base" aria-hidden="true">₩</span>현금흐름</a>
        <a href="#repayment" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500"><span className="text-base" aria-hidden="true">▦</span>상환계획</a>
        <a href="#policies" className="flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-slate-500"><span className="text-base" aria-hidden="true">◎</span>정책추천</a>
      </nav>
    </main>
  );
}
