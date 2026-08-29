import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/clientIp";

function requestWithForwardedFor(value: string | undefined): NextRequest {
  const headers = new Headers();
  if (value !== undefined) headers.set("x-forwarded-for", value);
  return new NextRequest("http://localhost/api/auth/login", { headers });
}

describe("getClientIp", () => {
  it("헤더가 없으면 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor(undefined))).toBe("unknown");
  });

  it("헤더가 빈 문자열이면 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor(""))).toBe("unknown");
  });

  it("헤더가 공백뿐이면 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor("   "))).toBe("unknown");
  });

  it("유효한 IPv4 하나만 있으면 그대로 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor("203.0.113.7"))).toBe("203.0.113.7");
  });

  it("유효한 IPv6 하나만 있으면 그대로 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor("2001:db8::1"))).toBe("2001:db8::1");
  });

  it("콤마로 여러 값이 오면 첫 번째 값만(트림해서) 사용한다", () => {
    expect(getClientIp(requestWithForwardedFor(" 203.0.113.7 , 198.51.100.9"))).toBe(
      "203.0.113.7"
    );
  });

  it("첫 값이 유효하지 않으면 뒤에 유효한 값이 있어도 unknown을 반환한다 (첫 값만 신뢰)", () => {
    expect(getClientIp(requestWithForwardedFor("not-an-ip, 203.0.113.7"))).toBe("unknown");
  });

  it("옥텟 범위를 벗어난 값(999.999.999.999)은 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor("999.999.999.999"))).toBe("unknown");
  });

  it("완전히 임의의 문자열은 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor("<script>alert(1)</script>"))).toBe("unknown");
  });

  it("콤마만 있고 값이 없으면 unknown을 반환한다", () => {
    expect(getClientIp(requestWithForwardedFor(","))).toBe("unknown");
  });
});
