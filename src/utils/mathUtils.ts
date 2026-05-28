export interface ExperimentalData {
  id: number;
  freq: number;
  vo: number;
  phase: number | null;
  isInterpolated?: boolean;
  gvLinear?: number;
  gvDb?: number;
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

// Algoritmo de Busca de Frequência de Corte a -3 dB e Interpolação de Fase
export function analyzeCutoffAndInterpolation(
  experimentalData: ExperimentalData[],
  globalVs: number,
  globalVsUnit: string = 'V',
  globalVoUnit: string = 'V',
  manualFcId: number | null = null
): {
  processedPoints: ExperimentalData[];
  fc: number | null;
  phaseC: number | null;
  maxGvDb: number;
  closestToCutoffId?: number | null;
  closestToCutoffFreq?: number | null;
} | null {
  // 1. Process experimental data points, sorting them by frequency
  const sortedPoints = [...experimentalData]
    .filter(p => !isNaN(p.freq) && !isNaN(p.vo) && p.freq > 0)
    .sort((a, b) => a.freq - b.freq)
    .map(p => {
      const gvLinear = p.vo / globalVs;
      const gvDb = 20 * Math.log10(gvLinear);

      return {
        ...p,
        gvLinear,
        gvDb
      };
    });

  if (sortedPoints.length < 2) return null;

  // Check if ALL empirical phases are missing
  const isAutoPhase = sortedPoints.every(p => p.phase === null || p.phase === undefined || isNaN(p.phase as number));

  // 2. Interpolate omitted phases first in place for sorted points
  if (!isAutoPhase) {
    for (let i = 0; i < sortedPoints.length; i++) {
      if (sortedPoints[i].phase === null || isNaN(sortedPoints[i].phase as number)) {
        // Find previous filled point
      let prev: ExperimentalData | null = null;
      for (let j = i - 1; j >= 0; j--) {
        if (sortedPoints[j].phase !== null && !isNaN(sortedPoints[j].phase as number)) {
          prev = sortedPoints[j];
          break;
        }
      }
      // Find next filled point
      let next: ExperimentalData | null = null;
      for (let j = i + 1; j < sortedPoints.length; j++) {
        if (sortedPoints[j].phase !== null && !isNaN(sortedPoints[j].phase as number)) {
          next = sortedPoints[j];
          break;
        }
      }

      if (prev && next) {
        // Logarithmic frequency interpolation
        const logF = Math.log10(sortedPoints[i].freq);
        const logFPrev = Math.log10(prev.freq);
        const logFNext = Math.log10(next.freq);
        
        sortedPoints[i].phase = (prev.phase as number) + 
          ((logF - logFPrev) / (logFNext - logFPrev)) * ((next.phase as number) - (prev.phase as number));
        sortedPoints[i].isInterpolated = true;
      } else {
        // Fallback se não conseguir interpolar
        sortedPoints[i].phase = 0;
        sortedPoints[i].isInterpolated = true;
      }
      }
    }
  }

  // Multiplier helper
  const getMultiplier = (unit: string) => {
    if (unit === 'mV') return 1e-3;
    if (unit === 'uV') return 1e-6;
    return 1;
  };

  const vsMult = getMultiplier(globalVsUnit);
  const voMult = getMultiplier(globalVoUnit);
  const realVs = globalVs * vsMult;

  // 2. Calculate Linear and Logarithmic Gain for all points
  for (let i = 0; i < sortedPoints.length; i++) {
    const vo = sortedPoints[i].vo;
    if (vo !== undefined && vo !== null) {
      const realVo = vo * voMult;
      const linearGain = realVo / realVs;
      sortedPoints[i].gvLinear = linearGain;
      sortedPoints[i].gvDb = linearGain > 0 ? 20 * Math.log10(linearGain) : -Infinity;
    }
  }

  // 3. Find cutoff point: identify max gain Gv_max (dB)
  let maxGvDb = -Infinity;
  
  for (let i = 0; i < sortedPoints.length; i++) {
    if (sortedPoints[i].gvDb !== undefined && (sortedPoints[i].gvDb as number) > maxGvDb) {
      maxGvDb = sortedPoints[i].gvDb as number;
    }
  }

  const targetGvDb = maxGvDb - 3.0103;

  // Search crossing intervals
  let fc = null;
  let phaseC = null;
  let crossingPrev: ExperimentalData | null = null;
  let crossingNext: ExperimentalData | null = null;
  let closestToCutoffId: number | null = null;
  let closestToCutoffFreq: number | null = null;

  if (manualFcId !== null) {
    const manualPoint = sortedPoints.find(p => p.id === manualFcId);
    if (manualPoint) {
      fc = manualPoint.freq;
      phaseC = manualPoint.phase !== null ? manualPoint.phase : 0;
      closestToCutoffId = manualPoint.id;
      closestToCutoffFreq = manualPoint.freq;
    }
  }
  
  if (fc === null) {
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      if ((sortedPoints[i].gvDb as number) >= targetGvDb && (sortedPoints[i+1].gvDb as number) <= targetGvDb) {
        crossingPrev = sortedPoints[i];
        crossingNext = sortedPoints[i+1];
        break;
      }
      if ((sortedPoints[i].gvDb as number) <= targetGvDb && (sortedPoints[i+1].gvDb as number) >= targetGvDb) {
        crossingPrev = sortedPoints[i];
        crossingNext = sortedPoints[i+1];
        break;
      }
    }

    // Perform logarithmic cutoff interpolation se cruzamento for encontrado
    if (crossingPrev && crossingNext) {
      const logF1 = Math.log10(crossingPrev.freq);
      const logF2 = Math.log10(crossingNext.freq);
      const g1 = crossingPrev.gvDb as number;
      const g2 = crossingNext.gvDb as number;

      const logFc = logF1 + ((targetGvDb - g1) / (g2 - g1)) * (logF2 - logF1);
      fc = Math.pow(10, logFc);

      // Phase interpolation at fc
      phaseC = (crossingPrev.phase as number) + 
        ((logFc - logF1) / (logF2 - logF1)) * ((crossingNext.phase as number) - (crossingPrev.phase as number));
    }
  }

  // 4. Closest point search if fc could not be identified or calculated
  if (fc !== null && manualFcId === null) {
    const targetGain = maxGvDb - 3.0103;
    let minGainDiff = Infinity;
    
    for (const p of sortedPoints) {
      if (p.gvDb === undefined) continue;
      const diff = Math.abs(p.gvDb - targetGain);
      if (diff < minGainDiff) {
        minGainDiff = diff;
        closestToCutoffId = p.id;
        closestToCutoffFreq = p.freq;
      }
    }
  }

  // 5. Automatic Theoretical Phase Calculation (Hidden from UI, pure heuristic)
  if (isAutoPhase && fc !== null) {
    let detectedFilter = 'unknown';
    const firstGain = sortedPoints[0].gvDb as number;
    const lastGain = sortedPoints[sortedPoints.length - 1].gvDb as number;
    
    if (firstGain < maxGvDb - 10 && lastGain < maxGvDb - 10) {
      detectedFilter = 'bandpass';
    } else if (firstGain < lastGain) {
      detectedFilter = 'highpass';
    } else {
      detectedFilter = 'lowpass';
    }

    let detectedOrder = 1;
    if (detectedFilter === 'lowpass') {
      const decadePoint = sortedPoints.find(p => p.freq >= fc! * 5);
      if (decadePoint) {
        const diff = maxGvDb - (decadePoint.gvDb as number);
        const decades = Math.log10(decadePoint.freq / fc!);
        const slope = diff / decades;
        if (slope > 30) detectedOrder = 2;
      }
    } else if (detectedFilter === 'highpass') {
      const decadePoint = sortedPoints.slice().reverse().find(p => p.freq <= fc! / 5);
      if (decadePoint) {
        const diff = maxGvDb - (decadePoint.gvDb as number);
        const decades = Math.log10(fc! / decadePoint.freq);
        const slope = diff / decades;
        if (slope > 30) detectedOrder = 2;
      }
    }

    sortedPoints.forEach(p => {
      const fRatio = p.freq / fc!;
      let theoPhase = 0;
      
      if (detectedFilter === 'lowpass') {
        if (detectedOrder === 1) {
          theoPhase = -Math.atan(fRatio) * (180 / Math.PI);
        } else {
          theoPhase = -Math.atan2(1.414 * fRatio, 1 - fRatio * fRatio) * (180 / Math.PI);
        }
      } else if (detectedFilter === 'highpass') {
        if (detectedOrder === 1) {
          theoPhase = 90 - Math.atan(fRatio) * (180 / Math.PI);
        } else {
          theoPhase = 180 - Math.atan2(1.414 * fRatio, 1 - fRatio * fRatio) * (180 / Math.PI);
        }
      } else if (detectedFilter === 'bandpass') {
        theoPhase = Math.atan(1 / fRatio - fRatio) * (180 / Math.PI);
      }
      p.phase = theoPhase;
      p.isInterpolated = true; // Marca como calculada para o CSV
    });

    if (detectedFilter === 'lowpass') phaseC = detectedOrder === 1 ? -45 : -90;
    else if (detectedFilter === 'highpass') phaseC = detectedOrder === 1 ? 45 : 90;
    else if (detectedFilter === 'bandpass') phaseC = 0;
  }

  return {
    processedPoints: sortedPoints,
    fc: fc,
    phaseC: phaseC,
    maxGvDb: maxGvDb,
    closestToCutoffId,
    closestToCutoffFreq
  };
}
