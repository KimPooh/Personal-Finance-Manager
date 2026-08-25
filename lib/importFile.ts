import Papa from "papaparse";
import ExcelJS from "exceljs";

export type ParsedRow = Record<string, string>;

/** CSV(.csv) 또는 엑셀(.xlsx) 파일을 헤더 기준 행 객체 배열로 변환 */
export async function parseUploadedRows(file: File): Promise<ParsedRow[]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || file.type === "text/csv") {
    const text = await file.text();
    const result = Papa.parse<ParsedRow>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    return result.data.filter((row) => Object.values(row).some((v) => String(v).trim() !== ""));
  }

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    // exceljs 타입 선언이 Buffer를 자체 ArrayBuffer 확장 인터페이스로 재정의해
    // Node Buffer와 구조적으로 어긋난다 (런타임에는 영향 없는 타입 선언 문제).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const headers: string[] = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = String(cell.value ?? "").trim();
    });

    const rows: ParsedRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: ParsedRow = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];
        if (!header) return;
        obj[header] = cell.text ?? String(cell.value ?? "");
      });
      if (Object.values(obj).some((v) => v.trim() !== "")) rows.push(obj);
    });
    return rows;
  }

  throw new Error("CSV(.csv) 또는 엑셀(.xlsx) 파일만 업로드할 수 있습니다.");
}

/** "1,234,000" / "₩1,234,000" 형태의 문자열을 숫자로 변환 */
export function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.-]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
