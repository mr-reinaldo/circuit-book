/**
 * Utility to parse experimental laboratory CSV data
 */

export interface ParsedCsvResult {
  globalValue?: number | null;
  globalUnit?: string | null;
  points: {
    freq: number;
    vo?: number | null;
    vMax?: number | null;
    vMin?: number | null;
    phase?: number | null;
  }[];
}

/**
 * Splits a CSV line safely respecting quoted fields containing commas
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(val => val.trim().replace(/^"|"$/g, ''));
}

/**
 * Parses raw CSV text and returns a parsed list of frequency points and metadata
 */
export function parseCsvContent(text: string): ParsedCsvResult {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return { points: [] };
  }

  // 1. Detect delimiter (, or ;)
  // We check the first few lines and count commas and semicolons
  let commaCount = 0;
  let semiCount = 0;
  const sampleLines = lines.slice(0, 5);
  for (const line of sampleLines) {
    commaCount += (line.match(/,/g) || []).length;
    semiCount += (line.match(/;/g) || []).length;
  }
  const delimiter = semiCount > commaCount ? ';' : ',';

  let globalValue: number | null = null;
  let globalUnit: string | null = null;
  let headerIndex = -1;

  // 2. Scan for metadata & find the table header line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = splitCsvLine(line, delimiter);
    
    // Check if it's a global source definition, e.g., "Vs(Global),5 V" or "Vin(Global),1 V"
    const firstCell = cells[0].toLowerCase();
    if (firstCell.includes('vs(global)') || firstCell.includes('vin(global)') || firstCell.includes('vs') || firstCell.includes('vin')) {
      if (cells[1]) {
        // Try parsing number and unit from cells[1], e.g., "1 V" or "5.0"
        const cleanVal = cells[1].replace(',', '.').trim();
        const numMatch = cleanVal.match(/^([+-]?[0-9]*\.?[0-9]+)\s*([a-zA-Zμμ]*)?/);
        if (numMatch) {
          globalValue = parseFloat(numMatch[1]);
          globalUnit = numMatch[2] ? numMatch[2].trim() : 'V';
        }
      }
      continue;
    }

    // Check if this line looks like the table headers
    const hasFreq = cells.some(c => {
      const lower = c.toLowerCase();
      return lower.includes('hz') || lower.includes('freq') || lower.includes('frequencia') || lower.includes('frequência');
    });

    if (hasFreq) {
      headerIndex = i;
      break;
    }
  }

  // If no header row could be found, assume the first non-metadata row is the header
  if (headerIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i], delimiter);
      if (cells[0] && !cells[0].includes('Global') && isNaN(parseFloat(cells[0].replace(',', '.')))) {
        headerIndex = i;
        break;
      }
    }
  }

  // Fallback: If still not found, data starts at index 0 without headers
  const finalHeaderIndex = headerIndex !== -1 ? headerIndex : -1;
  const headers = finalHeaderIndex !== -1 ? splitCsvLine(lines[finalHeaderIndex], delimiter) : [];

  // Map header titles to column types case-insensitively
  let freqColIdx = -1;
  let voColIdx = -1;
  let vMaxColIdx = -1;
  let vMinColIdx = -1;
  let phaseColIdx = -1;

  headers.forEach((header, index) => {
    const h = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip accents
    
    if (h.includes('hz') || h.includes('freq')) {
      freqColIdx = index;
    } else if (h === 'vo' || h === 'vo(v)' || h === 'vo(mv)' || h === 'vout' || h === 'vout_pp(v)' || h === 'vout_pp' || h === 'vs (v)' || h === 'vs(v)') {
      // In student passive CSVs, Vo is labeled as "Vs (V)" or "Vs (mV)"
      voColIdx = index;
    } else if (h.includes('vmax') || h === 'max') {
      vMaxColIdx = index;
    } else if (h.includes('vmin') || h === 'min') {
      vMinColIdx = index;
    } else if (h.includes('fase') || h.includes('phase') || h.includes('graus') || h.includes('deg') || h.includes('angulo')) {
      phaseColIdx = index;
    }
  });

  // Passive fallback: if voColIdx is still -1, and we have a column labeled "vs (mv)", map that
  if (voColIdx === -1) {
    headers.forEach((header, index) => {
      const h = header.toLowerCase();
      if (h.includes('vs (mv)') || h.includes('vs (v)') || h.includes('vs(mv)') || h.includes('vs(v)')) {
        voColIdx = index;
      }
    });
  }

  // Active fallback: if vMax or vMin is still -1, try to find by position or name
  if (vMaxColIdx === -1) {
    vMaxColIdx = headers.findIndex(h => h.toLowerCase().includes('max'));
  }
  if (vMinColIdx === -1) {
    vMinColIdx = headers.findIndex(h => h.toLowerCase().includes('min'));
  }

  // Default index positions if headers are missing
  if (freqColIdx === -1) freqColIdx = 0;
  if (voColIdx === -1 && vMaxColIdx === -1) voColIdx = 1;

  const points: ParsedCsvResult['points'] = [];
  const startRow = finalHeaderIndex !== -1 ? finalHeaderIndex + 1 : 0;

  for (let i = startRow; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    
    // Ignore lines that don't have enough cells
    if (cells.length <= Math.max(freqColIdx, voColIdx, vMaxColIdx, vMinColIdx, phaseColIdx)) {
      continue;
    }

    const parseVal = (str: string | undefined): number | null => {
      if (!str) return null;
      const clean = str.trim().replace(',', '.');
      if (clean === '' || clean.toLowerCase() === 'n/a' || clean.toLowerCase() === 'nao' || clean.toLowerCase() === 'nan' || clean.toLowerCase() === 'null') {
        return null;
      }
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? null : parsed;
    };

    const freq = parseVal(cells[freqColIdx]);
    if (freq === null || freq <= 0) {
      continue; // Skip lines with invalid frequency
    }

    const vo = voColIdx !== -1 ? parseVal(cells[voColIdx]) : null;
    const vMax = vMaxColIdx !== -1 ? parseVal(cells[vMaxColIdx]) : null;
    const vMin = vMinColIdx !== -1 ? parseVal(cells[vMinColIdx]) : null;
    const phase = phaseColIdx !== -1 ? parseVal(cells[phaseColIdx]) : null;

    points.push({
      freq,
      vo,
      vMax,
      vMin,
      phase
    });
  }

  return {
    globalValue,
    globalUnit,
    points
  };
}
