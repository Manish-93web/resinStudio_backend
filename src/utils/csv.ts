/**
 * Minimal RFC4180-ish CSV encode/decode. No dependency pulled in for this since the format is
 * fully under our control on export, and import only needs to survive what Excel/Sheets produce
 * (quoted fields containing commas/quotes/newlines) - not arbitrary malformed CSV.
 */

export function toCsvField(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsvRow(fields: unknown[]): string {
  return fields.map(toCsvField).join(',');
}

export function buildCsv(header: string[], rows: unknown[][]): string {
  return [toCsvRow(header), ...rows.map(toCsvRow)].join('\r\n');
}

/** Parses full CSV text into rows of string cells, honoring quoted fields per RFC4180. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Parses CSV text into an array of objects keyed by the header row. */
export function parseCsvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const [header, ...dataRows] = rows;
  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    header!.forEach((key, i) => {
      obj[key.trim()] = row[i] ?? '';
    });
    return obj;
  });
}
