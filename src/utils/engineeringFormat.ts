/**
 * Shared engineering notation utilities.
 * Consolidated from mathUtils.ts and mathUtilsOpamp.ts to eliminate duplication.
 */

// Regex estrito para validação prévia de segurança do formulário (OWASP Prevention)
const validEngineeringPattern = /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?([pnuμmkKM])?$/;

function validateAndSanitizeInput(rawInput: string) {
  const sanitized = rawInput.trim();
  if (sanitized !== "" && !validEngineeringPattern.test(sanitized)) {
    throw new Error('Formato de entrada de dados inválido ou inseguro.');
  }
  return sanitized;
}

// Engineering scale parser
export function parseEngineeringValue(inputString: string): number {
  try {
    // Normalize decimal comma to dot BEFORE validation to avoid blocking safe input like '1,5'
    const normalized = validateAndSanitizeInput(inputString.replace(',', '.'));
    if (normalized === "") return NaN;

    // Regex para notação científica pura (ex: 10e-9 ou 2.2e3)
    const scientificRegex = /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/;
    // Regex para sufixos métricos de engenharia (ex: 10n, 2.2k, 100u)
    const metricRegex = /^([-+]?[0-9]*\.?[0-9]+)([pnuμmkKM])$/;

    if (scientificRegex.test(normalized)) {
      return parseFloat(normalized);
    }

    const metricMatch = normalized.match(metricRegex);
    if (metricMatch) {
      const value = parseFloat(metricMatch[1]);
      const unit = metricMatch[2];

      const multipliers: Record<string, number> = {
        p: 1e-12,
        n: 1e-9,
        u: 1e-6,
        μ: 1e-6,
        m: 1e-3,
        k: 1e3,
        K: 1e3,
        M: 1e6,
      };

      return value * (multipliers[unit] || 1);
    }

    return parseFloat(normalized);
  } catch (error: any) {
    console.warn("Input validation blocked:", error.message);
    return NaN;
  }
}

export function formatForInput(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  const absVal = Math.abs(value);
  if (absVal === 0) return "0";
  if (absVal >= 1e6 && (value / 1e6) * 1000 % 1 === 0) return `${value / 1e6}M`;
  if (absVal >= 1e3 && (value / 1e3) * 1000 % 1 === 0) return `${value / 1e3}k`;
  return value.toString();
}

// Format value back to engineering unit elegantly
export function formatEngineeringValue(value: number, unitSymbol: string = ""): string {
  if (isNaN(value) || value === null) return "N/A";
  const absVal = Math.abs(value);
  
  if (absVal === 0) return `0.00 ${unitSymbol}`;
  
  if (absVal >= 1e6) return `${(value / 1e6).toFixed(2)} M${unitSymbol}`;
  if (absVal >= 1e3) return `${(value / 1e3).toFixed(2)} k${unitSymbol}`;
  if (absVal >= 1) return `${value.toFixed(2)} ${unitSymbol}`;
  if (absVal >= 1e-3) return `${(value * 1e3).toFixed(2)} m${unitSymbol}`;
  if (absVal >= 1e-6) return `${(value * 1e6).toFixed(2)} μ${unitSymbol}`;
  if (absVal >= 1e-9) return `${(value * 1e9).toFixed(2)} n${unitSymbol}`;
  return `${(value * 1e12).toFixed(2)} p${unitSymbol}`;
}

// Unit multiplier helper (consolidated from 3 duplicate definitions)
export function getUnitMultiplier(unit: string): number {
  if (unit === 'mV') return 1e-3;
  if (unit === 'uV') return 1e-6;
  return 1;
}
