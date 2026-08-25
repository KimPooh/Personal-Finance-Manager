// 정책 설명 문장 안의 핵심 숫자(금액·비율·기간)를 자동으로 굵게 강조해
// 긴 문장 속에서도 중요한 조건이 눈에 바로 들어오게 합니다.
const HIGHLIGHT_PATTERN =
  /(\d+(?:,\d{3})*(?:\.\d+)?\s*(?:천만원|백만원|만원|억원|원)|\d+(?:\.\d+)?(?:\s*[~-]\s*\d+(?:\.\d+)?)?\s*%|\d+(?:\.\d+)?\s*(?:개월|년|일|주))/g;

export function HighlightedText({ text }: { text: string }) {
  const parts = text.split(HIGHLIGHT_PATTERN);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-accent">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}
