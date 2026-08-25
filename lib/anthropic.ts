import Anthropic from "@anthropic-ai/sdk";
import type { FinancialContext } from "@/lib/financialContext";

export function isAdvisorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  return new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `당신은 개인 자산관리 앱에 내장된 재무상담 도우미입니다.
아래 규칙을 반드시 지켜 답변하세요.

1. 답변은 이번 메시지와 함께 전달된 "재무 데이터"(JSON)만 근거로 사용하세요. 이름, 계좌번호,
   금융회사명 등은 전달되지 않으며 알 수도 없습니다. 데이터에 없는 사실을 지어내지 마세요.
2. 계산이 필요한 질문(예: 이자 절감액, 상환 순서)에는 사용한 숫자와 계산 과정을 답변에
   간단히 함께 보여주세요.
3. 투자수익률이나 정부 지원정책 대상 여부를 확정적으로 단정하지 마세요. "~일 수 있습니다",
   "~로 추정됩니다" 등으로 표현하고, 정확한 확인은 금융회사·관련 기관에서 해야 한다고
   안내하세요.
4. 대출 상환 우선순위, 큰 자금 이동, 정책상품 신청 등 중요한 결정은 최종적으로 금융기관이나
   전문가(세무사, 재무설계사 등)와 상담할 것을 권하세요.
5. 한국어로, 간결하고 이해하기 쉽게 답변하세요.`;

export async function askFinancialAdvisor(
  userMessage: string,
  context: FinancialContext,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  const contextBlock = `[재무 데이터 - JSON]\n${JSON.stringify(context, null, 2)}`;

  const response = await client.messages.create({
    model,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: `${contextBlock}\n\n[사용자 질문]\n${userMessage}` },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "응답을 생성하지 못했습니다.";
}

export interface PolicyCheckInput {
  slug: string;
  title: string;
  officialUrl: string;
  eligibilityText: string;
  benefit: string;
  applicationPeriod: string;
  requiredDocuments: string;
  verifiedDate: string;
}

export interface PolicyCheckResult {
  slug: string;
  status: "unchanged" | "updated" | "ended" | "unverified";
  changes?: Partial<{
    title: string;
    eligibilityText: string;
    benefit: string;
    applicationPeriod: string;
    requiredDocuments: string;
  }>;
  note: string;
}

const POLICY_CHECK_SYSTEM_PROMPT = (today: string) => `당신은 한국 정부 지원정책 정보를 검증하는 리서처입니다.
오늘 날짜는 ${today}입니다.

아래 목록의 각 정책에 대해 반드시 web_search 도구로 제공된 공식 URL(및 필요시 관련 공식
사이트)을 확인한 뒤, 다음을 판단하세요:
- 신청기간, 금리·혜택 금액, 자격요건이 마지막 확인 내용과 달라졌는지
- 제도가 종료되었거나 후속 제도로 대체되었는지
- 공식 출처에서 확인이 불가능한 경우

규칙:
- 반드시 공식 출처(정부 부처·공공기관 홈페이지)만 근거로 삼으세요. 확인되지 않은 내용을
  추측해서 채우지 마세요.
- 실제로 확인해서 바뀐 부분이 있는 필드만 changes에 포함하세요. 확인했지만 그대로면
  changes를 비우고 status는 "unchanged"로 표시하세요.
- 공식 출처에 접근할 수 없거나 내용을 신뢰할 수 없으면 status를 "unverified"로 표시하고
  changes는 비우세요.
- 제도가 종료/폐지된 게 확실하면 status를 "ended"로 표시하세요.

검증이 끝나면 다른 설명 없이, 마지막에 아래 형식의 JSON 코드블록 하나만 출력하세요:

\`\`\`json
{"results": [{"slug": "...", "status": "unchanged|updated|ended|unverified", "changes": {"title": "...", "eligibilityText": "...", "benefit": "...", "applicationPeriod": "...", "requiredDocuments": "..."}, "note": "확인 내용 한 줄 요약 (한국어)"}]}
\`\`\``;

/** Claude의 웹 검색 도구로 큐레이션된 정책 데이터를 공식 출처와 대조 검증합니다. */
export async function checkPolicyUpdates(
  policies: PolicyCheckInput[]
): Promise<{ results: PolicyCheckResult[]; checkedAt: string }> {
  const client = getClient();
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const today = new Date().toISOString().slice(0, 10);

  const listText = policies
    .map(
      (p) =>
        `- slug: ${p.slug}\n  제목: ${p.title}\n  공식 URL: ${p.officialUrl}\n  현재 지원대상: ${p.eligibilityText}\n  현재 혜택: ${p.benefit}\n  현재 신청기간: ${p.applicationPeriod}\n  현재 필요서류: ${p.requiredDocuments}\n  마지막 확인일: ${p.verifiedDate}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model,
    max_tokens: 8000,
    system: POLICY_CHECK_SYSTEM_PROMPT(today),
    tools: [
      {
        type: "web_search_20260209",
        name: "web_search",
        max_uses: 20,
      },
    ],
    messages: [
      {
        role: "user",
        content: `다음 ${policies.length}개 정책을 확인해주세요:\n\n${listText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    throw new Error("검증 결과를 파싱할 수 없습니다. 응답 형식이 예상과 다릅니다.");
  }

  const parsed = JSON.parse(match[1]) as { results: PolicyCheckResult[] };
  return { results: parsed.results, checkedAt: today };
}
