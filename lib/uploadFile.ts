const OLE_COMPOUND_FILE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] as const;

/**
 * 비밀번호가 설정된 OOXML(.xlsx)은 ZIP이 아니라 OLE Compound File 컨테이너로 저장됩니다.
 * 구형 .xls와 같은 컨테이너이므로, 확장자가 .xlsx일 때만 암호화 파일로 판정합니다.
 */
export function hasOleCompoundFileSignature(bytes: Uint8Array): boolean {
  return OLE_COMPOUND_FILE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

export async function isEncryptedXlsxFile(file: File): Promise<boolean> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) return false;
  const header = new Uint8Array(await file.slice(0, OLE_COMPOUND_FILE_SIGNATURE.length).arrayBuffer());
  return hasOleCompoundFileSignature(header);
}
