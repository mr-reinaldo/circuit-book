// Re-export shared engineering utilities from the canonical module
export { parseEngineeringValue, formatForInput, formatEngineeringValue, getUnitMultiplier } from './engineeringFormat';
import { getUnitMultiplier } from './engineeringFormat';

export interface ExperimentalData {
  id: number;
  freq: number;
  vo: number;
  phase: number | null;
  isInterpolated?: boolean;
  gvLinear?: number;
  gvDb?: number;
  phaseTheoretical?: number;
  phaseError?: number | null;
}

export function analyzeCutoffAndInterpolation(
  experimentalData: ExperimentalData[],
  globalVs: number,
  globalVsUnit: string = 'V',
  globalVoUnit: string = 'V',
  amplitudeMode: 'vpp' | 'vrms' = 'vpp'
): {
  processedPoints: ExperimentalData[];
  fc: number | null;
  phaseC: number | null;
  maxGvDb: number;
  closestToCutoffId?: number | null;
  closestToCutoffFreq?: number | null;
  detectedFilter?: string;
  detectedOrder?: number;
} | null {
  // 1. Process experimental data points, sorting them by frequency
  const sortedPoints = [...experimentalData]
    .filter(p => !isNaN(p.freq) && !isNaN(p.vo) && p.freq > 0)
    .sort((a, b) => a.freq - b.freq)
    .map((p): ExperimentalData => {
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

  const vsMult = getUnitMultiplier(globalVsUnit);
  const voMult = getUnitMultiplier(globalVoUnit);
  const realVs = (globalVs && !isNaN(globalVs) && globalVs !== 0) ? globalVs * vsMult : 1.0;

  // 2. Calculate Linear and Logarithmic Gain for all points
  for (let i = 0; i < sortedPoints.length; i++) {
    const vo = sortedPoints[i].vo;
    if (vo !== undefined && vo !== null) {
      let realVo = vo * voMult;
      if (amplitudeMode === 'vrms') {
        realVo = realVo / (2 * Math.sqrt(2));
      }
      const linearGain = realVo / realVs;
      sortedPoints[i].gvLinear = linearGain;
      sortedPoints[i].gvDb = linearGain > 0 ? 20 * Math.log10(Math.abs(linearGain)) : -Infinity;
    }
  }

  // 3. Find cutoff point: identify max gain Gv_max (dB)
  let maxGvDb = -Infinity;
  let maxGvLinear = 0;
  
  for (let i = 0; i < sortedPoints.length; i++) {
    if (sortedPoints[i].gvDb !== undefined && (sortedPoints[i].gvDb as number) > maxGvDb) {
      maxGvDb = sortedPoints[i].gvDb as number;
    }
    if (sortedPoints[i].gvLinear !== undefined && (sortedPoints[i].gvLinear as number) > maxGvLinear) {
      maxGvLinear = sortedPoints[i].gvLinear as number;
    }
  }

  // High-precision Logarithmic Cutoff Interpolation
  const targetGv = maxGvLinear * 0.7071;
  let fc = null;
  let phaseC = null;
  let closestToCutoffId: number | null = null;
  let closestToCutoffFreq: number | null = null;

  if (sortedPoints.length > 1) {
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const gv1 = sortedPoints[i].gvLinear;
      const gv2 = sortedPoints[i+1].gvLinear;

      if (gv1 !== undefined && gv2 !== undefined && !isNaN(gv1) && !isNaN(gv2)) {
        // Check if cutoff crosses between these two points
        if ((gv1 >= targetGv && gv2 <= targetGv) || (gv1 <= targetGv && gv2 >= targetGv)) {
          const logF1 = Math.log10(sortedPoints[i].freq);
          const logF2 = Math.log10(sortedPoints[i+1].freq);
          const denom = gv2 - gv1;
          const ratio = denom !== 0 ? (targetGv - gv1) / denom : 0.5;
          
          const logFc = logF1 + ratio * (logF2 - logF1);
          fc = Math.pow(10, logFc);
          
          closestToCutoffId = Math.abs(gv1 - targetGv) < Math.abs(gv2 - targetGv) 
                              ? sortedPoints[i].id 
                              : sortedPoints[i+1].id;
          closestToCutoffFreq = fc;
          break;
        }
      }
    }
  }

  // Fallback to closest point if no crossing is detected (e.g. single point or incomplete curve)
  if (fc === null && sortedPoints.length > 0) {
    let minDiff = Infinity;
    let bestPoint = sortedPoints[0];
    for (const p of sortedPoints) {
      if (p.gvLinear !== undefined && !isNaN(p.gvLinear)) {
        const diff = Math.abs(p.gvLinear - targetGv);
        if (diff < minDiff) {
          minDiff = diff;
          bestPoint = p;
        }
      }
    }
    fc = bestPoint.freq;
    closestToCutoffId = bestPoint.id;
    closestToCutoffFreq = bestPoint.freq;
  }

  // 5. Automatic Theoretical Phase Calculation & Error Margin Analysis
  let detectedFilter = 'unknown';
  let detectedOrder = 1;

  if (fc !== null) {
    const firstGain = sortedPoints[0].gvDb as number;
    const lastGain = sortedPoints[sortedPoints.length - 1].gvDb as number;
    
    if (firstGain < maxGvDb - 10 && lastGain < maxGvDb - 10) {
      detectedFilter = 'bandpass';
    } else if (firstGain < lastGain) {
      detectedFilter = 'highpass';
    } else {
      detectedFilter = 'lowpass';
    }

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

    // Always calculate theoretical phase for each point
    sortedPoints.forEach(p => {
      p.phaseTheoretical = calculateTheoreticalPhase(p.freq, fc!, detectedFilter, detectedOrder, true); // true for passive
      
      if (p.phase === null || isNaN(p.phase as number)) {
        if (isAutoPhase) {
          p.phase = p.phaseTheoretical;
          p.isInterpolated = true;
          p.phaseError = 0;
        }
      } else {
        // Calculate error percentage compared to theoretical phase
        if (p.phaseTheoretical !== 0) {
          p.phaseError = (Math.abs(p.phase - p.phaseTheoretical) / Math.abs(p.phaseTheoretical)) * 100;
        } else {
          p.phaseError = Math.abs(p.phase - p.phaseTheoretical); // absolute difference fallback if theoretical is exactly 0
        }
      }
    });

    if (detectedFilter === 'lowpass') phaseC = detectedOrder === 1 ? -45 : (detectedOrder === 2 ? -52.55 : -90);
    else if (detectedFilter === 'highpass') phaseC = detectedOrder === 1 ? 45 : (detectedOrder === 2 ? 52.55 : 90);
    else if (detectedFilter === 'bandpass') phaseC = 0;
  }

  return {
    processedPoints: sortedPoints,
    fc: fc,
    phaseC: phaseC,
    maxGvDb: maxGvDb,
    closestToCutoffId,
    closestToCutoffFreq,
    detectedFilter,
    detectedOrder
  };
}

export function calculateTheoreticalPhase(f: number, fc: number, type: string, order: number, isPassive: boolean = false): number {
  const fRatio = f / fc;
  if (type === 'lowpass') {
    if (order === 1) {
      return -Math.atan(fRatio) * (180 / Math.PI);
    } else if (order === 2 && isPassive) {
      // Passive 2nd order LPF with loading effect
      // fc = 0.37424 * f0 => f0 = fc / 0.37424 => f/f0 = 0.37424 * (f/fc)
      const x = 0.37424 * fRatio;
      return -Math.atan2(3 * x, 1 - x * x) * (180 / Math.PI);
    } else {
      // 2nd order Butterworth LPF (Active)
      return -Math.atan2(1.414 * fRatio, 1 - fRatio * fRatio) * (180 / Math.PI);
    }
  } else if (type === 'highpass') {
    if (order === 1) {
      return 90 - Math.atan(fRatio) * (180 / Math.PI);
    } else if (order === 2 && isPassive) {
      // Passive 2nd order HPF with loading effect
      // fc = 2.67209 * f0 => f0 = fc / 2.67209 => f/f0 = 2.67209 * (f/fc)
      const x = 2.67209 * fRatio;
      return 180 - Math.atan2(3 * x, 1 - x * x) * (180 / Math.PI);
    } else {
      // 2nd order Butterworth HPF (Active)
      return 180 - Math.atan2(1.414 * fRatio, 1 - fRatio * fRatio) * (180 / Math.PI);
    }
  } else if (type === 'bandpass') {
    return Math.atan(1 / fRatio - fRatio) * (180 / Math.PI);
  }
  return 0;
}

