import { getXlsx } from "./utils/dynamic-imports";

export interface ParsedFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, "_");
}

/** Attempt to parse a Markdown pipe-table. Returns null if content doesn't look like one. */
function parseMarkdownTable(text: string, fileName: string): ParsedFile | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  const headerLine = lines[0]!;
  const sepLine = lines[1]!;
  // Separator must consist only of pipes, dashes, colons, spaces
  if (!headerLine.includes("|") || !/^[|\-\s:]+$/.test(sepLine)) return null;

  const parseRow = (line: string): string[] => {
    const stripped = line.replace(/^\||\|$/g, "");
    return stripped.split("|").map((c) => c.trim());
  };

  const headers = parseRow(headerLine);
  const rows = lines.slice(2).map((line) => {
    const cells = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });

  return { fileName, headers, rows, rowCount: rows.length };
}

function parseDelimited(text: string, delimiter: string, fileName: string): ParsedFile {
  const rawLines = text.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("File is empty");

  const parseLine = (line: string): string[] => {
    if (delimiter !== ",") return line.split(delimiter).map((c) => c.trim());
    // RFC 4180-aware CSV parser for comma delimiter
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  };

  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });

  return { fileName, headers, rows, rowCount: rows.length };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();

  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await getXlsx();
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer);
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("No sheets found in workbook");
    const sheet = wb.Sheets[sheetName]!;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!json.length) throw new Error("The spreadsheet is empty");
    const headers = Object.keys(json[0]!);
    const rows = json.map((r) =>
      Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")]))
    );
    return { fileName: file.name, headers, rows, rowCount: rows.length };
  }

  const text = await file.text();

  if (ext === "md" || ext === "markdown") {
    const md = parseMarkdownTable(text, file.name);
    if (!md) throw new Error("Could not find a Markdown table in the file");
    return md;
  }

  if (ext === "tsv" || ext === "tab") {
    return parseDelimited(text, "\t", file.name);
  }

  // CSV or unknown — auto-detect delimiter
  const firstLine = text.split("\n")[0] ?? "";
  const tabCount = (firstLine.match(/\t/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  // If more tabs than commas, treat as TSV. Else try Markdown, else CSV.
  if (tabCount > commaCount) return parseDelimited(text, "\t", file.name);
  if (!commaCount && firstLine.includes("|")) {
    const md = parseMarkdownTable(text, file.name);
    if (md) return md;
  }
  return parseDelimited(text, ",", file.name);
}

/** Auto-map headers to platform field keys using alias matching. */
export function autoMapHeaders(
  headers: string[],
  platformFields: Array<{ key: string; aliases: string[] }>
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  for (const field of platformFields) {
    const aliasNorms = field.aliases.map(normalizeKey);
    const match = headers.find((h) => {
      if (usedHeaders.has(h)) return false;
      const hn = normalizeKey(h);
      return aliasNorms.includes(hn);
    });
    if (match) {
      mapping[field.key] = match;
      usedHeaders.add(match);
    }
  }
  return mapping;
}

/**
 * Build a normalized CSV blob using the confirmed field mapping.
 * Mapped columns get the platform field name as header.
 * Unmapped columns keep their original name (stored as custom_properties by backend).
 */
export function buildNormalizedCsv(
  headers: string[],
  rows: Record<string, string>[],
  mapping: Record<string, string>  // platformFieldKey -> csvColumnHeader
): File {
  const mappedCsvCols = new Set(Object.values(mapping));
  const extraCols = headers.filter((h) => !mappedCsvCols.has(h));
  const outputHeaders = [...Object.keys(mapping), ...extraCols];

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const csvLines = [
    outputHeaders.map(esc).join(","),
    ...rows.map((row) =>
      outputHeaders
        .map((h) => {
          const srcCol = mapping[h]; // defined for platform fields
          return esc(srcCol ? (row[srcCol] ?? "") : (row[h] ?? ""));
        })
        .join(",")
    ),
  ];

  return new File([csvLines.join("\n")], "contacts.csv", { type: "text/csv" });
}
