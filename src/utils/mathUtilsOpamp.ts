export interface OpampDataPoint {
  id: string;
  freq: number;
  vMax: number | null;
  vMin: number | null;
  phase: number | null;
  isInterpolated?: boolean;
  vppOut?: number;
  gvLinear?: number;
  gvDb?: number;
  phaseTheoretical?: number;
  phaseError?: number | null;
}

// Regex estrito para validação prévia de segurança do formulário (OWASP Prevention)
export const validEngineeringPattern = /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?([pnuμmkKM])?$/;

export function validateAndSanitizeInput(rawInput: string) {
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

function getUnitMultiplier(unit: string) {
  if (unit === 'mV') return 1e-3;
  if (unit === 'uV') return 1e-6;
  return 1;
}

/**
 * Calculador de Fase Teórica para Filtros Ativos baseados em AmpOps.
 * Como o AmpOp isola eletricamente os estágios, estes filtros não sofrem
 * o Efeito de Carga físico, comportando-se como modelos de "Cascata Ideal" (sem perdas entre estágios).
 */
export function calculateTheoreticalPhaseOpamp(
  f: number, 
  fc: number, 
  type: string, 
  order: number
): number {
  const fRatio = f / fc;
  if (type === 'lowpass') {
    if (order === 1) {
      return -Math.atan(fRatio) * (180 / Math.PI);
    } else {
      // Passa-Baixa (2ª Ordem - Cascata Ideal / Isolada por OpAmp)
      return -2 * Math.atan(fRatio) * (180 / Math.PI);
    }
  } else if (type === 'highpass') {
    if (order === 1) {
      return Math.atan(fc / f) * (180 / Math.PI);
    } else {
      // Passa-Alta (2ª Ordem - Cascata Ideal / Isolada por OpAmp)
      return 2 * Math.atan(fc / f) * (180 / Math.PI);
    }
  } else if (type === 'bandpass') {
    return Math.atan(1 / fRatio - fRatio) * (180 / Math.PI);
  }
  return 0;
}

/**
 * Analisador de dados de resposta em frequência para circuitos ativos (OpAmps)
 */
export function analyzeOpampData(
  points: OpampDataPoint[],
  globalVinPp: number,
  vinUnit: string = 'V',
  voutUnit: string = 'V'
): {
  processedPoints: OpampDataPoint[];
  maxGvDb: number;
  cutoffFreq: number | null;
  closestToCutoffId: string | null;
  detectedFilter?: string;
  detectedOrder?: number;
} {
  const multVin = getUnitMultiplier(vinUnit);
  const multVout = getUnitMultiplier(voutUnit);

  const processedPoints = points.map(p => {
    const clone = { ...p };
    if (clone.vMax !== null && clone.vMin !== null && clone.freq > 0) {
      clone.vppOut = Math.abs(clone.vMax - clone.vMin);
      // Proteção explícita de denominador para evitar qualquer divisão por zero
      const vin = globalVinPp > 0 ? globalVinPp : 1.0;
      
      const trueVout = clone.vppOut * multVout;
      const trueVin = vin * multVin;

      clone.gvLinear = trueVout / trueVin;
      clone.gvDb = clone.gvLinear > 0 ? 20 * Math.log10(Math.abs(clone.gvLinear)) : -Infinity;
    }
    return clone;
  });

  processedPoints.sort((a, b) => a.freq - b.freq);

  // Phase interpolation logarítmica para dados faltantes
  const isAutoPhase = processedPoints.every(p => p.phase === null || p.phase === undefined || isNaN(p.phase as number));
  if (!isAutoPhase) {
    for (let i = 0; i < processedPoints.length; i++) {
      if (processedPoints[i].phase === null || isNaN(processedPoints[i].phase as number)) {
        let prev: OpampDataPoint | null = null;
        for (let j = i - 1; j >= 0; j--) {
          if (processedPoints[j].phase !== null && !isNaN(processedPoints[j].phase as number)) {
            prev = processedPoints[j];
            break;
          }
        }
        let next: OpampDataPoint | null = null;
        for (let j = i + 1; j < processedPoints.length; j++) {
          if (processedPoints[j].phase !== null && !isNaN(processedPoints[j].phase as number)) {
            next = processedPoints[j];
            break;
          }
        }

        if (prev && next) {
          const logF = Math.log10(processedPoints[i].freq);
          const logFPrev = Math.log10(prev.freq);
          const logFNext = Math.log10(next.freq);
          
          processedPoints[i].phase = (prev.phase as number) + 
            ((logF - logFPrev) / (logFNext - logFPrev)) * ((next.phase as number) - (prev.phase as number));
          processedPoints[i].isInterpolated = true;
        } else {
          processedPoints[i].phase = 0;
          processedPoints[i].isInterpolated = true;
        }
      }
    }
  }

  let maxGvDb = -Infinity;
  let maxGvLinear = 0;
  for (const p of processedPoints) {
    if (p.gvDb !== undefined && !isNaN(p.gvDb) && p.gvDb > maxGvDb) {
      maxGvDb = p.gvDb;
    }
    if (p.gvLinear !== undefined && !isNaN(p.gvLinear) && p.gvLinear > maxGvLinear) {
      maxGvLinear = p.gvLinear;
    }
  }

  const targetGv = maxGvLinear * 0.7071;
  let closestToCutoffId: string | null = null;
  let cutoffFreq: number | null = null;

  if (processedPoints.length > 1) {
    for (let i = 0; i < processedPoints.length - 1; i++) {
      const gv1 = processedPoints[i].gvLinear;
      const gv2 = processedPoints[i+1].gvLinear;

      if (gv1 !== undefined && gv2 !== undefined && !isNaN(gv1) && !isNaN(gv2)) {
        // Check if cutoff crosses between these two points
        if ((gv1 >= targetGv && gv2 <= targetGv) || (gv1 <= targetGv && gv2 >= targetGv)) {
          const logF1 = Math.log10(processedPoints[i].freq);
          const logF2 = Math.log10(processedPoints[i+1].freq);
          const denom = gv2 - gv1;
          const ratio = denom !== 0 ? (targetGv - gv1) / denom : 0.5;
          
          const logFc = logF1 + ratio * (logF2 - logF1);
          cutoffFreq = Math.pow(10, logFc);
          
          closestToCutoffId = Math.abs(gv1 - targetGv) < Math.abs(gv2 - targetGv) 
                              ? processedPoints[i].id 
                              : processedPoints[i+1].id;
          break;
        }
      }
    }
  }

  // Fallback to closest point if no crossing is detected (e.g. single point or incomplete curve)
  if (cutoffFreq === null && processedPoints.length > 0) {
    let minDiff = Infinity;
    let bestPoint = processedPoints[0];
    for (const p of processedPoints) {
      if (p.gvLinear !== undefined && !isNaN(p.gvLinear)) {
        const diff = Math.abs(p.gvLinear - targetGv);
        if (diff < minDiff) {
          minDiff = diff;
          bestPoint = p;
        }
      }
    }
    cutoffFreq = bestPoint.freq;
    closestToCutoffId = bestPoint.id;
  }

  // Automatic Theoretical Phase Calculation & Error Margin Analysis
  let detectedFilter = 'unknown';
  let detectedOrder = 1;

  if (cutoffFreq !== null && maxGvDb !== -Infinity && processedPoints.length > 0) {
    // Robust noise detection using average of first and last points (mapping -Infinity to -100dB, and dynamically adjusting slice to avoid overlapping small datasets)
    const dbPoints = processedPoints.map(p => {
      const gvDb = p.gvDb === -Infinity ? -100 : (p.gvDb !== undefined ? p.gvDb : -100);
      return { ...p, gvDb };
    }).filter(p => p.gvDb !== undefined && !isNaN(p.gvDb));
    
    const sliceCount = Math.max(1, Math.min(3, Math.floor(dbPoints.length / 2)));
    const startGain = dbPoints.length > 0 
      ? dbPoints.slice(0, sliceCount).reduce((acc, p) => acc + (p.gvDb as number), 0) / sliceCount
      : -100;
    const endGain = dbPoints.length > 0
      ? dbPoints.slice(-sliceCount).reduce((acc, p) => acc + (p.gvDb as number), 0) / sliceCount
      : -100;
    
    if (startGain < maxGvDb - 10 && endGain < maxGvDb - 10) {
      detectedFilter = 'bandpass';
    } else if (startGain < endGain) {
      detectedFilter = 'highpass';
    } else {
      detectedFilter = 'lowpass';
    }

    if (detectedFilter === 'lowpass') {
      const decadePoint = processedPoints.find(p => p.freq >= cutoffFreq! * 5);
      if (decadePoint) {
        // Only calculate slope if the decade point is not in the noise floor (-Infinity / zero gain)
        if (decadePoint.gvDb !== undefined && !isNaN(decadePoint.gvDb) && decadePoint.gvDb !== -Infinity) {
          const diff = maxGvDb - decadePoint.gvDb;
          const decades = Math.log10(decadePoint.freq / cutoffFreq!);
          const slope = diff / decades;
          if (slope > 30) detectedOrder = 2;
        }
      }
    } else if (detectedFilter === 'highpass') {
      const decadePoint = processedPoints.slice().reverse().find(p => p.freq <= cutoffFreq! / 5);
      if (decadePoint) {
        // Only calculate slope if the decade point is not in the noise floor (-Infinity / zero gain)
        if (decadePoint.gvDb !== undefined && !isNaN(decadePoint.gvDb) && decadePoint.gvDb !== -Infinity) {
          const diff = maxGvDb - decadePoint.gvDb;
          const decades = Math.log10(cutoffFreq! / decadePoint.freq);
          const slope = diff / decades;
          if (slope > 30) detectedOrder = 2;
        }
      }
    }

    // Always calculate theoretical phase for each point
    processedPoints.forEach(p => {
      p.phaseTheoretical = calculateTheoreticalPhaseOpamp(p.freq, cutoffFreq!, detectedFilter, detectedOrder);
      
      if (p.phase === null || isNaN(p.phase as number)) {
        if (isAutoPhase) {
          p.phase = p.phaseTheoretical;
          p.isInterpolated = true;
          p.phaseError = 0;
        }
      } else {
        // Calcula o erro absoluto em graus (mais confiável para diagramas de Bode, eliminando divisões por zero)
        p.phaseError = Math.abs(p.phase - p.phaseTheoretical);
      }
    });
  }

  return {
    processedPoints,
    maxGvDb,
    cutoffFreq,
    closestToCutoffId,
    detectedFilter,
    detectedOrder
  };
}
