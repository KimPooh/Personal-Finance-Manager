import crypto from "node:crypto";

// 기관명·메모 등 민감 텍스트 필드를 저장 전 암호화하기 위한 유틸리티.
// 금액(숫자) 필드는 합계·차트 계산을 위해 평문으로 저장하며,
// 대신 로컬 전용 실행 + OS 디스크 암호화로 보완하는 것을 전제로 합니다.

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY 환경변수가 없거나 올바르지 않습니다 (64자리 hex 문자열이어야 함)."
    );
  }
  return Buffer.from(hex, "hex");
}

// 저장 형식: base64(iv).base64(authTag).base64(ciphertext)
export function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    "."
  );
}

export function decryptText(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("암호화된 데이터 형식이 올바르지 않습니다.");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export function encryptOptional(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  return encryptText(plain);
}

export function decryptOptional(payload: string | null | undefined): string | null {
  if (payload == null) return null;
  return decryptText(payload);
}

/**
 * 원문을 복원할 필요가 없는 검색용 지문(예: 은행 CSV 거래 중복 판정)을 HMAC-SHA256으로
 * 해시합니다. 일반 SHA 해시 대신 ENCRYPTION_KEY를 키로 쓰는 HMAC을 사용해, 적요처럼 예측
 * 가능한 입력이라도 키 없이는 사전대입으로 원문을 추정할 수 없게 합니다.
 */
export function hmacFingerprint(input: string): string {
  return crypto.createHmac("sha256", getKey()).update(input, "utf8").digest("hex");
}
