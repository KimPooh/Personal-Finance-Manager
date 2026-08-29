import { isIP } from "node:net";
import type { NextRequest } from "next/server";

// 로그인 rate limiting의 IP 버킷에 사용할 클라이언트 IP를 추출한다.
//
// 중요: `x-forwarded-for`의 첫 번째 값을 신뢰하는 것은 이 앱이 Vercel처럼 신뢰할 수
// 있는 리버스 프록시 뒤에서 실행되어, 그 프록시가 실제 클라이언트 IP를 이 헤더의
// 맨 앞에 붙이고 이후 값은 체인을 따라 추가한다는 보장이 있을 때만 안전하다. 그런
// 신뢰할 수 있는 프록시 없이 이 앱이 직접 인터넷에 노출된다면, 클라이언트가 이
// 헤더 자체를 임의로 조작해 원하는 IP를 자칭할 수 있으므로 이 값을 그대로 신뢰하면
// 안 된다.
//
// 반환값은 항상 유효한 IPv4/IPv6 형식이거나 고정 문자열 "unknown"이다 - 헤더가
// 없거나, 비어 있거나, 공백뿐이거나, 형식이 유효하지 않은 값(예: "999.999.999.999")은
// 모두 "unknown"으로 폴백한다. 느슨한 정규식 대신 Node 표준 `node:net`의 isIP()로
// 각 옥텟/세그먼트까지 실제로 검증한다.
export function getClientIp(req: NextRequest): string {
  const header = req.headers.get("x-forwarded-for");
  if (!header) return "unknown";

  const first = header.split(",")[0]?.trim();
  if (!first) return "unknown";

  if (isIP(first) === 0) return "unknown";

  return first;
}
