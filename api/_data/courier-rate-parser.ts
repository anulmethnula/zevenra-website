import readXlsxFile from "read-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_ROWS = 50_000;
const text = (value: unknown) => String(value ?? "").trim();
type ParsedRow = { rowNumber: number; raw: Record<string, unknown> };

export function normalizeCourierRateImportRows(rows: ParsedRow[]) {
  return rows.map((row) => ({ row_number: row.rowNumber, raw: row.raw }));
}

export function duplicateCourierRateKeys(rows: Array<{ district:string; city:string }>) {
  const counts=new Map<string,number>();
  for(const row of rows){const value=`${row.district.trim().toLocaleLowerCase()}\u0000${row.city.trim().toLocaleLowerCase()}`;counts.set(value,(counts.get(value)||0)+1);}
  return new Set([...counts].filter(([,count])=>count>1).map(([value])=>value));
}

export function suggestedCourierRateField(header: string) {
  const value = header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (/from.*branch|origin.*branch/.test(value)) return "fromBranch";
  if (/district/.test(value)) return "destinationDistrict";
  if (/city|area|destination|to city/.test(value)) return "destinationCity";
  if (/additional|extra|subsequent/.test(value)) return "additionalKgCharge";
  if (/first|1st|initial/.test(value) && /kg|charge|rate|fee/.test(value)) return "firstKgCharge";
  return "";
}

export async function parseCourierRateFile(fileName: string, base64: string) {
  const extension = fileName.toLowerCase().split(".").pop(), buffer = Buffer.from(base64, "base64");
  if (!extension || !["xlsx", "csv"].includes(extension)) throw new Error("Choose an .xlsx or .csv rate sheet.");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error("Rate sheet must be between 1 byte and 3 MB.");
  let matrix: unknown[][];
  if (extension === "xlsx") matrix = await readXlsxFile(buffer);
  else matrix = parseCsv(buffer, { bom: true, relax_column_count: true, skip_empty_lines: false }) as unknown[][];
  const headerIndex = matrix.findIndex((row) => row.some((cell) => text(cell)));
  if (headerIndex < 0) throw new Error("The rate sheet is empty.");
  const used = new Map<string, number>();
  const headers = matrix[headerIndex].map((cell, index) => {
    const base = text(cell) || `Column ${index + 1}`, count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
  const rows: ParsedRow[] = matrix.slice(headerIndex + 1).map((row, index) => ({
    rowNumber: headerIndex + index + 2,
    raw: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""])),
    populated: row.some((cell) => text(cell)),
  })).filter((row) => row.populated).map(({ rowNumber, raw }) => ({ rowNumber, raw }));
  if (!rows.length) throw new Error("No data rows were found below the detected header row.");
  if (rows.length > MAX_ROWS) throw new Error(`Rate sheets are limited to ${MAX_ROWS.toLocaleString()} rows.`);
  return { extension, headers, rows };
}
