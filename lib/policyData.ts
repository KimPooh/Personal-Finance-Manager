// 정부 지원정책/정책금융상품 큐레이션 데이터.
// 반드시 공식 출처에서 확인한 제도만 포함하며, 종료되었거나 출처·확인일이
// 불분명한 제도는 포함하지 않습니다. 정기적으로(특히 신청기간·금리 등)
// 공식 출처를 재확인해 업데이트해야 합니다.

export interface CuratedPolicy {
  slug: string;
  title: string;
  agency: string;
  summary: string;
  eligibilityText: string;
  benefit: string;
  applicationPeriod: string;
  requiredDocuments: string;
  officialUrl: string;
  sourceName: string;
  verifiedDate: string; // YYYY-MM-DD
  // 금융 용어에 익숙하지 않은 사회초년생·고령층도 이해할 수 있도록 쉽게 풀어쓴
  // 한 줄 설명. 법적 정확성이 필요한 자격요건/혜택 원문과 달리 구어체 요약이라
  // 영어로도 함께 제공합니다.
  simpleSummary: { ko: string; en: string };
}

export const CURATED_POLICIES: CuratedPolicy[] = [
  {
    slug: "geunro-jangryeogeum",
    title: "근로장려금 (근로·자녀장려세제)",
    agency: "국세청",
    summary:
      "저소득 근로자·사업자 가구에 근로·사업소득에 비례하여 현금을 지급해 실질소득을 지원하는 제도입니다.",
    eligibilityText:
      "가구유형(단독/홑벌이/맞벌이)에 따라 연소득 기준(약 2,200만~4,400만원 미만)과 가구원 재산 합계 2억 4천만원 미만 요건이 적용됩니다. 가구유형 판정이 복잡해 정확한 대상 여부는 홈택스 모의계산으로 확인이 필요합니다.",
    benefit:
      "가구유형별 최대 지급액 예상: 단독가구 약 165만원, 홑벌이가구 약 285만원, 맞벌이가구 약 330만원 (정확한 금액은 홈택스 모의계산 결과를 따름)",
    applicationPeriod: "정기신청 매년 5월 1일~5월 31일 (기한후신청 6월 1일~11월 30일, 지급액 10% 감액)",
    requiredDocuments: "대부분 국세청 보유자료로 자동 심사되어 별도 제출서류가 거의 없음 (신분증 등)",
    officialUrl: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2450&cntntsId=7784",
    sourceName: "국세청 공식 홈페이지",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "일은 하고 있지만 소득이 적은 분에게 나라가 현금을 얹어주는 제도예요. 매년 5월 홈택스에서 신청하면 대상인지 자동으로 계산해줘요.",
      en: "If you're working but earning a modest income, the government tops it up with cash. Apply each May through Hometax — it automatically calculates whether you qualify.",
    },
  },
  {
    slug: "cheongnyeon-naeil-jeochuk",
    title: "청년내일저축계좌 (자산형성지원사업)",
    agency: "보건복지부 (한국자활복지개발원 운영)",
    summary:
      "일하는 저소득 청년의 자산형성을 돕기 위해 본인 저축액에 정부 매칭 지원금을 더해주는 통장 상품입니다.",
    eligibilityText:
      "신청 당시 만 15~39세, 가구소득 기준 중위소득 50% 이하, 월 10만원 이상 근로·사업소득이 있어야 합니다. 기준 중위소득 50% 여부는 가구원 수에 따라 달라 정확한 판정에는 별도 확인이 필요합니다.",
    benefit: "본인 저축액(월 10~50만원) 대비 정부매칭 1:3 지원 (3년 만기 시 원금 대비 최대 4배 수령 가능)",
    applicationPeriod: "연 1회 정기 모집 (2026년 모집: 5월 4일~5월 20일)",
    requiredDocuments: "별도 제출서류 없음 (행정정보 자동 확인, 신분증 지참)",
    officialUrl: "https://www.gov.kr/portal/rcvfvrSvc/dtlEx/135200005013",
    sourceName: "정부24 (gov.kr) / 복지로(bokjiro.go.kr)",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "매달 저축하면 정부가 최대 3배를 더 보태주는 청년 전용 적금이에요. 3년을 채우면 내가 넣은 돈의 몇 배를 받을 수 있어요.",
      en: "A savings account for young adults where the government adds up to 3x whatever you save each month. Stick with it for 3 years and you get back several times what you put in.",
    },
  },
  {
    slug: "cheongnyeon-mirae-jeokgeum",
    title: "청년미래적금 (청년도약계좌 후속 상품)",
    agency: "서민금융진흥원",
    summary:
      "청년의 중장기 자산형성을 지원하기 위해 매월 적립액에 비례해 정부 기여금을 지급하고 이자소득을 비과세하는 적금 상품입니다. 2025년 말 신규가입이 종료된 청년도약계좌를 대체합니다.",
    eligibilityText:
      "만 19~34세(군 복무기간 최대 6년 별도 인정), 개인 총급여 7,500만원 이하(종합소득 6,300만원 이하), 가구소득 기준 중위소득 200% 이하 요건이 있습니다. 가구소득 조건까지 포함한 정확한 판정은 서민금융진흥원 확인이 필요합니다.",
    benefit: "은행 이자 + 정부기여금(일반형 6%, 우대형 12%) + 이자소득 비과세",
    applicationPeriod: "정기 모집 (최근 회차 2026년 6월 22일~7월 3일, 이후 회차는 서민금융진흥원 공지 확인)",
    requiredDocuments: "신분증, 소득금액증명원(또는 근로·사업소득 증빙), 가구소득 확인용 가족관계증명서",
    officialUrl: "https://www.kinfa.or.kr/financialProduct/youthFutureSavings.do",
    sourceName: "서민금융진흥원 공식 홈페이지",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "청년이 적금을 넣으면 은행 이자에 정부 지원금까지 얹어주는 상품이에요. 이자에 붙는 세금도 안 떼요.",
      en: "A savings product for young adults where the government adds a bonus on top of regular bank interest — and it's tax-free.",
    },
  },
  {
    slug: "beotimok-jeonse",
    title: "버팀목전세자금대출",
    agency: "주택도시기금 (국토교통부)",
    summary: "무주택 서민의 전월세 보증금 마련을 지원하는 저금리 전세자금 대출입니다.",
    eligibilityText:
      "세대주 포함 세대원 전원 무주택, 부부합산 연소득 5천만원 이하(신혼·다자녀 등은 최대 7,500만원까지 완화), 순자산 3.45억원 이하 요건이 있습니다.",
    benefit: "보증금의 최대 80%까지, 수도권 최대 1.2억원 / 지방 최대 8천만원, 변동금리 연 2.5~3.5% 수준",
    applicationPeriod: "상시 접수 (임차주택 잔금지급일 또는 전입일 중 빠른 날로부터 3개월 이내 신청)",
    requiredDocuments: "임대차계약서, 확정일자부 서류, 주민등록등본, 소득증빙서류, 가족관계증명서, 무주택확인서류",
    officialUrl: "https://www.myhome.go.kr/hws/portal/cont/selectSupLeaseLoanView.do",
    sourceName: "마이홈포털 (주택도시기금 공식 포털)",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "집이 없는 분이 전세금을 마련할 때, 시중 은행보다 낮은 이자로 나라에서 빌려주는 대출이에요.",
      en: "If you don't own a home and need money for a jeonse (lump-sum) deposit, this is a government-backed loan at a lower rate than a regular bank.",
    },
  },
  {
    slug: "didimdol-loan",
    title: "내집마련 디딤돌대출",
    agency: "주택도시기금 (국토교통부)",
    summary: "무주택 서민의 주택 구입자금을 저리로 지원하는 정책 모기지 대출입니다.",
    eligibilityText:
      "세대주 포함 세대원 전원 무주택, 부부합산 연소득 6천만원 이하(신혼가구 등 최대 8,500만원까지 완화), 순자산 5.11억원 이하, 전용면적 85㎡ 이하 주택 요건이 있습니다.",
    benefit: "대출한도 일반 2억원 / 신혼가구 3.2억원 이내, 금리 연 2.85~4.15% (LTV 최대 70%, 생애최초 80%)",
    applicationPeriod: "상시 접수 (소유권이전등기 전 또는 등기 후 3개월 이내)",
    requiredDocuments: "주택매매계약서, 소득증빙서류, 주민등록등본, 가족관계증명서, 무주택확인서류",
    officialUrl: "https://www.myhome.go.kr/hws/portal/cont/selectSteppingStoneLoanView.do",
    sourceName: "마이홈포털 (주택도시기금 공식 포털)",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "생애 처음 집을 살 때, 나라가 저렴한 이자로 구입 자금을 빌려주는 대출이에요.",
      en: "A low-interest government loan to help you buy your first home.",
    },
  },
  {
    slug: "sinsaeng-teukrye",
    title: "신생아 특례 디딤돌대출 / 버팀목대출",
    agency: "주택도시기금 (국토교통부)",
    summary:
      "출산·입양 가구의 내 집 마련 및 전세자금 마련을 지원하기 위해 완화된 소득기준과 저금리를 적용하는 특례 대출입니다.",
    eligibilityText:
      "대출신청일 기준 2년 이내 출산 또는 입양한 자녀가 1명 이상 있어야 하며(2023.1.1. 이후 출생아부터 적용), 부부합산 연소득 1.3억원 이하(맞벌이는 합산 최대 2억원), 무주택 세대주(또는 1주택 대환) 요건이 있습니다. 출산 시점 요건은 시스템이 자동 판정할 수 없어 확인이 필요합니다.",
    benefit: "구입자금 최대 4~5억원, 금리 연 1.6~3.3% (특례금리 기본 5년), 추가 출산 자녀 1명당 0.2%p 우대",
    applicationPeriod: "상시 접수 (디딤돌: 등기 전 또는 등기 후 3개월 이내 / 버팀목: 전입일로부터 3개월 이내)",
    requiredDocuments: "출생증명서 또는 입양관계증명서, 가족관계증명서, 주민등록등본, 소득증빙서류, 주택매매·임대차계약서",
    officialUrl: "https://www.myhome.go.kr/hws/portal/cont/selectBabySpecialCaseStepStoneLoneView.do",
    sourceName: "마이홈포털 (주택도시기금 공식 포털)",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "최근 2년 안에 아이를 낳거나 입양했다면, 집을 사거나 전세금을 구할 때 훨씬 낮은 이자로 대출받을 수 있어요.",
      en: "If you've had or adopted a baby within the last 2 years, you can borrow at a much lower rate to buy a home or cover a jeonse deposit.",
    },
  },
  {
    slug: "bogeumjari-loan",
    title: "보금자리론",
    agency: "한국주택금융공사",
    summary:
      "무주택 서민의 주택구입자금을 장기·고정금리로 지원하는 정책 모기지 대출로, 특례보금자리론(2024.1 종료) 이후 상시 운영 중인 정규 상품입니다.",
    eligibilityText:
      "부부합산 연소득 7천만원 이하(신혼·저소득청년 등 우대), 무주택 또는 처분조건부 1주택자, 주택가격 6억원 이하 요건이 있습니다.",
    benefit:
      "대출한도 최대 3.6억원, 기본금리(2026.08 기준) 연 4.90~5.30%, 신혼·다자녀·저소득청년 등 우대금리 최대 1.0%p 중복 적용 가능",
    applicationPeriod: "상시 접수 (한국주택금융공사 인터넷뱅킹 또는 협약은행)",
    requiredDocuments: "주택매매계약서, 소득증빙서류, 주민등록등본, 가족관계증명서, 무주택확인서류",
    officialUrl: "https://www.hf.go.kr/ko/sub01/sub01_01_04.do",
    sourceName: "한국주택금융공사 공식 홈페이지",
    verifiedDate: "2026-08-25",
    simpleSummary: {
      ko: "집을 살 때 처음부터 끝까지 금리가 바뀌지 않는 안정적인 대출을 받을 수 있는 제도예요.",
      en: "A stable home-purchase loan with a fixed interest rate that won't change for the life of the loan.",
    },
  },
];
