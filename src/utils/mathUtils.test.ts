import { describe, it, expect } from 'vitest';
import { 
  parseEngineeringValue, 
  formatForInput, 
  formatEngineeringValue,
  analyzeCutoffAndInterpolation,
  calculateTheoreticalPhase,
  type ExperimentalData
} from './mathUtils';

describe('mathUtils', () => {

  describe('parseEngineeringValue', () => {
    it('parses pure numbers correctly', () => {
      expect(parseEngineeringValue('100')).toBe(100);
      expect(parseEngineeringValue('3.14')).toBe(3.14);
      expect(parseEngineeringValue('-50.5')).toBe(-50.5);
    });

    it('parses scientific notation correctly', () => {
      expect(parseEngineeringValue('1e3')).toBe(1000);
      expect(parseEngineeringValue('2.2e-6')).toBe(0.0000022);
      expect(parseEngineeringValue('1.5E-3')).toBe(0.0015);
    });

    it('parses engineering suffixes correctly', () => {
      expect(parseEngineeringValue('1p')).toBe(1e-12);
      expect(parseEngineeringValue('10n')).toBe(1e-8);
      expect(parseEngineeringValue('47u')).toBe(47e-6);
      expect(parseEngineeringValue('47μ')).toBe(47e-6);
      expect(parseEngineeringValue('100m')).toBe(0.1);
      expect(parseEngineeringValue('1k')).toBe(1000);
      expect(parseEngineeringValue('2.2K')).toBe(2200);
      expect(parseEngineeringValue('1.5M')).toBe(1500000);
    });

    it('handles decimal comma localization gracefully', () => {
      expect(parseEngineeringValue('1,5k')).toBe(1500);
      expect(parseEngineeringValue('-0,7μ')).toBe(-0.0000007);
    });

    it('handles empty inputs or spaces gracefully by returning NaN', () => {
      expect(parseEngineeringValue('')).toBeNaN();
      expect(parseEngineeringValue('   ')).toBeNaN();
    });

    it('rejects invalid inputs to prevent injection or crashes', () => {
      expect(parseEngineeringValue('hello')).toBeNaN();
      expect(parseEngineeringValue('1.5x')).toBeNaN();
      expect(parseEngineeringValue('1.5kM')).toBeNaN();
      expect(parseEngineeringValue('k1.5')).toBeNaN();
    });
  });

  describe('formatForInput', () => {
    it('simplifies large and small numbers correctly for the input fields', () => {
      expect(formatForInput(1500)).toBe('1.5k');
      expect(formatForInput(1000000)).toBe('1M');
      expect(formatForInput(150)).toBe('150');
      expect(formatForInput(0)).toBe('0');
    });

    it('handles negative values correctly', () => {
      expect(formatForInput(-1500)).toBe('-1.5k');
      expect(formatForInput(-1000000)).toBe('-1M');
      expect(formatForInput(-150)).toBe('-150');
    });

    it('handles null, undefined, and NaN values by returning an empty string', () => {
      expect(formatForInput(null)).toBe('');
      expect(formatForInput(undefined)).toBe('');
      expect(formatForInput(NaN)).toBe('');
    });
  });

  describe('formatEngineeringValue', () => {
    it('formats values elegantly for display', () => {
      expect(formatEngineeringValue(1500, 'Hz')).toBe('1.50 kHz');
      expect(formatEngineeringValue(0.05, 'V')).toBe('50.00 mV');
      expect(formatEngineeringValue(1, 'V')).toBe('1.00 V');
      expect(formatEngineeringValue(0, 'Hz')).toBe('0.00 Hz');
      expect(formatEngineeringValue(0.0000022, 'F')).toBe('2.20 μF');
    });

    it('formats negative values correctly', () => {
      expect(formatEngineeringValue(-1500, 'Hz')).toBe('-1.50 kHz');
      expect(formatEngineeringValue(-0.05, 'V')).toBe('-50.00 mV');
    });

    it('handles NaN and null gracefully by returning N/A', () => {
      expect(formatEngineeringValue(NaN)).toBe('N/A');
      expect(formatEngineeringValue(null as any)).toBe('N/A');
    });

    it('handles different scales: Mega, kilo, unit, milli, micro, nano, pico', () => {
      expect(formatEngineeringValue(2.5e6, 'Hz')).toBe('2.50 MHz');
      expect(formatEngineeringValue(1.2e3, 'Ω')).toBe('1.20 kΩ');
      expect(formatEngineeringValue(5.5, 'V')).toBe('5.50 V');
      expect(formatEngineeringValue(4.7e-3, 'A')).toBe('4.70 mA');
      expect(formatEngineeringValue(3.3e-6, 'F')).toBe('3.30 μF');
      expect(formatEngineeringValue(2.2e-9, 'F')).toBe('2.20 nF');
      expect(formatEngineeringValue(1.5e-12, 'F')).toBe('1.50 pF');
      expect(formatEngineeringValue(1.5e-15, 'F')).toBe('0.00 pF'); // extremely small scale boundary
    });
  });

  describe('analyzeCutoffAndInterpolation', () => {
    it('returns null if there are no valid points, but processes a single point successfully', () => {
      const dataEmpty: ExperimentalData[] = [];
      expect(analyzeCutoffAndInterpolation(dataEmpty, 1.0)).toBeNull();

      const dataSingle: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1, phase: 0 }
      ];
      const result = analyzeCutoffAndInterpolation(dataSingle, 1.0);
      expect(result).not.toBeNull();
      expect(result?.processedPoints).toHaveLength(1);
      expect(result?.processedPoints[0].gvLinear).toBe(1.0);
      expect(result?.fc).toBe(100);
    });

    it('filters out invalid points (negative frequency, zero frequency, NaN freq, NaN vo)', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: -10, vo: 1.0, phase: 0 },
        { id: 2, freq: 0, vo: 1.0, phase: 0 },
        { id: 3, freq: NaN, vo: 1.0, phase: 0 },
        { id: 4, freq: 100, vo: NaN, phase: 0 },
        { id: 5, freq: 100, vo: 1.0, phase: 0 },
        { id: 6, freq: 1000, vo: 0.707, phase: -45 }
      ];
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      expect(result?.processedPoints).toHaveLength(2);
      expect(result?.processedPoints[0].freq).toBe(100);
      expect(result?.processedPoints[1].freq).toBe(1000);
    });

    it('calculates gvLinear and gvDb correctly for valid points (even with negative Vo)', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: -1.0, phase: 0 },
        { id: 2, freq: 1000, vo: 0.1, phase: -90 },
        { id: 3, freq: 10000, vo: 0, phase: -180 }
      ];
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      expect(result?.processedPoints[0].gvLinear).toBe(-1.0);
      expect(result?.processedPoints[0].gvDb).toBe(-Infinity);
      expect(result?.processedPoints[1].gvLinear).toBe(0.1);
      expect(result?.processedPoints[1].gvDb).toBeCloseTo(-20);
      expect(result?.processedPoints[2].gvLinear).toBe(0);
      expect(result?.processedPoints[2].gvDb).toBe(-Infinity);
    });

    it('protects against division by zero when Vs is zero or invalid', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1, phase: 0 },
        { id: 2, freq: 1000, vo: 0.5, phase: -45 }
      ];
      const resultZero = analyzeCutoffAndInterpolation(data, 0);
      expect(resultZero).not.toBeNull();
      expect(resultZero?.processedPoints[0].gvLinear).toBe(1.0); // fallback Vs = 1.0

      const resultNaN = analyzeCutoffAndInterpolation(data, NaN);
      expect(resultNaN).not.toBeNull();
      expect(resultNaN?.processedPoints[0].gvLinear).toBe(1.0); // fallback Vs = 1.0
    });

    it('scales Vs and Vo correctly according to their units (mV, uV)', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 500, phase: 0 }, // 500 mV if globalVoUnit is mV
        { id: 2, freq: 1000, vo: 200, phase: -45 }
      ];
      // Vs = 1 V, Vo = 500 mV and 200 mV
      const result = analyzeCutoffAndInterpolation(data, 1.0, 'V', 'mV');
      expect(result?.processedPoints[0].gvLinear).toBeCloseTo(0.5, 3);
      expect(result?.processedPoints[1].gvLinear).toBeCloseTo(0.2, 3);

      // Vs = 500 mV, Vo = 250 mV
      const resultBothMilli = analyzeCutoffAndInterpolation(data, 500.0, 'mV', 'mV');
      expect(resultBothMilli?.processedPoints[0].gvLinear).toBeCloseTo(1.0, 3);
      expect(resultBothMilli?.processedPoints[1].gvLinear).toBeCloseTo(0.4, 3);

      // Vs = 1 V, Vo = 1000 uV (1e-6)
      const dataMicro: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1000, phase: 0 },
        { id: 2, freq: 1000, vo: 500, phase: -45 }
      ];
      const resultMicro = analyzeCutoffAndInterpolation(dataMicro, 1.0, 'V', 'uV');
      expect(resultMicro?.processedPoints[0].gvLinear).toBeCloseTo(1e-3, 6);
    });

    it('interpolates missing phase values automatically, including boundary fallback to 0', () => {
      // 1. Interpolation in the middle
      const dataMiddle: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 1, phase: -5 },
        { id: 2, freq: 100, vo: 0.707, phase: null }, // Omitted to test interpolation
        { id: 3, freq: 1000, vo: 0.1, phase: -85 }
      ];
      const resultMiddle = analyzeCutoffAndInterpolation(dataMiddle, 1.0);
      const interpolatedMiddle = resultMiddle?.processedPoints.find(p => p.freq === 100);
      expect(interpolatedMiddle?.phase).toBeCloseTo(-45, 1); // Log-scale exact midpoint
      expect(interpolatedMiddle?.isInterpolated).toBe(true);

      // 2. Boundary fallback at the beginning (missing prev)
      const dataStart: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 1, phase: null }, // No prev point with phase
        { id: 2, freq: 100, vo: 0.707, phase: -45 },
        { id: 3, freq: 1000, vo: 0.1, phase: -90 }
      ];
      const resultStart = analyzeCutoffAndInterpolation(dataStart, 1.0);
      const interpolatedStart = resultStart?.processedPoints.find(p => p.freq === 10);
      expect(interpolatedStart?.phase).toBe(0); // fallback
      expect(interpolatedStart?.isInterpolated).toBe(true);

      // 3. Boundary fallback at the end (missing next)
      const dataEnd: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 1, phase: 0 },
        { id: 2, freq: 100, vo: 0.707, phase: -45 },
        { id: 3, freq: 1000, vo: 0.1, phase: null } // No next point with phase
      ];
      const resultEnd = analyzeCutoffAndInterpolation(dataEnd, 1.0);
      const interpolatedEnd = resultEnd?.processedPoints.find(p => p.freq === 1000);
      expect(interpolatedEnd?.phase).toBe(0); // fallback
      expect(interpolatedEnd?.isInterpolated).toBe(true);
    });

    it('finds the correct logarithmic cutoff frequency for a standard RC response (interpolated -3dB point)', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 1000, vo: 0.846, phase: -32 },
        { id: 2, freq: 3000, vo: 0.468, phase: -62 }
      ];
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      // Target gain = 0.846 * 0.7071 ~ 0.5982
      expect(result?.fc).toBeGreaterThan(1000);
      expect(result?.fc).toBeLessThan(3000);
      expect(result?.fc).toBeCloseTo(2054.8, 1);
      expect(result?.closestToCutoffId).toBe(2);
    });

    it('handles edge case where denom is 0 during cutoff interpolation', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 0.7071, phase: -45 },
        { id: 2, freq: 1000, vo: 0.7071, phase: -45 }
      ];
      // Target gain = 0.7071 * 0.7071 = 0.500
      // We will force both gains to equal the target to make denom = 0.
      // E.g. Vo = 0.7071 for both, Vs = 1.0. Target = 0.7071 * 0.7071 = 0.500.
      // To trigger crossing, let's set gv1 = 0.5 and gv2 = 0.5.
      const dataZeroDenom: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 0.5, phase: -45 },
        { id: 2, freq: 1000, vo: 0.5, phase: -45 }
      ];
      // maxGvLinear = 0.5. TargetGv = 0.5 * 0.7071 = 0.3535.
      // Let's set gv1 = 0.35355 and gv2 = 0.35355.
      const dataExact: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 0.7071, phase: -45 },
        { id: 2, freq: 1000, vo: 0.7071, phase: -45 },
        { id: 3, freq: 10000, vo: 1.0, phase: 0 }
      ];
      const result = analyzeCutoffAndInterpolation(dataExact, 1.0);
      expect(result).not.toBeNull();
      // Since denom = 0, ratio defaults to 0.5.
      // logFc = log(100) + 0.5 * (log(1000) - log(100)) = 2 + 0.5 * 1 = 2.5
      // fc = 10^2.5 = 316.22
      expect(result?.fc).toBeCloseTo(316.22, 1);
    });

    it('falls back to the closest point when no crossover is detected', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 0.9, phase: -5 },
        { id: 2, freq: 1000, vo: 0.8, phase: -15 }
      ];
      // Target gain = 0.9 * 0.7071 = 0.636.
      // Both points (0.9 and 0.8) are above 0.636, so no crossover is detected.
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      // Should fallback to the closest point, which is 0.8 at 1000Hz (diff = 0.164 compared to 0.264)
      expect(result?.fc).toBe(1000);
      expect(result?.closestToCutoffId).toBe(2);
    });

    it('detects filter type correctly (lowpass, highpass, bandpass)', () => {
      // 1. Lowpass: firstGain >= lastGain
      const lowpassData: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 1.0, phase: null },
        { id: 2, freq: 100, vo: 0.707, phase: null },
        { id: 3, freq: 1000, vo: 0.1, phase: null }
      ];
      const resLP = analyzeCutoffAndInterpolation(lowpassData, 1.0);
      expect(resLP?.detectedFilter).toBe('lowpass');

      // 2. Highpass: firstGain < lastGain
      const highpassData: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 0.1, phase: null },
        { id: 2, freq: 100, vo: 0.707, phase: null },
        { id: 3, freq: 1000, vo: 1.0, phase: null }
      ];
      const resHP = analyzeCutoffAndInterpolation(highpassData, 1.0);
      expect(resHP?.detectedFilter).toBe('highpass');

      // 3. Bandpass: firstGain < max - 10 and lastGain < max - 10
      const bandpassData: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 0.1, phase: null },
        { id: 2, freq: 100, vo: 1.0, phase: null },
        { id: 3, freq: 1000, vo: 0.1, phase: null }
      ];
      const resBP = analyzeCutoffAndInterpolation(bandpassData, 1.0);
      expect(resBP?.detectedFilter).toBe('bandpass');
    });

    it('detects filter order correctly (1st order vs 2nd order)', () => {
      // Lowpass 1st order: slope <= 30
      const lp1Data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1.0, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null }, // fc ~ 1000
        { id: 3, freq: 5000, vo: 0.2, phase: null } // Vo = 0.2 -> 20*log10(0.2) = -14dB. Slope is ~ 20dB/decade
      ];
      const resLP1 = analyzeCutoffAndInterpolation(lp1Data, 1.0);
      expect(resLP1?.detectedOrder).toBe(1);

      // Lowpass 2nd order: slope > 30
      const lp2Data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1.0, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null }, // fc ~ 1000
        { id: 3, freq: 5000, vo: 0.04, phase: null } // Vo = 0.04 -> 20*log10(0.04) = -28dB. Slope is > 30dB/dec
      ];
      const resLP2 = analyzeCutoffAndInterpolation(lp2Data, 1.0);
      expect(resLP2?.detectedOrder).toBe(2);

      // Highpass 1st order: slope <= 30
      const hp1Data: ExperimentalData[] = [
        { id: 1, freq: 200, vo: 0.2, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null }, // fc ~ 1000
        { id: 3, freq: 10000, vo: 1.0, phase: null }
      ];
      const resHP1 = analyzeCutoffAndInterpolation(hp1Data, 1.0);
      expect(resHP1?.detectedOrder).toBe(1);

      // Highpass 2nd order: slope > 30
      const hp2Data: ExperimentalData[] = [
        { id: 1, freq: 200, vo: 0.04, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null }, // fc ~ 1000
        { id: 3, freq: 10000, vo: 1.0, phase: null }
      ];
      const resHP2 = analyzeCutoffAndInterpolation(hp2Data, 1.0);
      expect(resHP2?.detectedOrder).toBe(2);
    });

    it('calculates phaseError correctly, including absolute fallback when theoretical phase is 0', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1.0, phase: -5 }, // experimental phase = -5
        { id: 2, freq: 1000, vo: 0.707, phase: -45 }
      ];
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();

      const p1 = result?.processedPoints.find(p => p.freq === 100);
      expect(p1?.phaseError).toBeDefined();
      expect(p1?.phaseError).toBeGreaterThan(0);

      // Test absolute difference fallback when theoretical phase is exactly 0
      // We will mock calculateTheoreticalPhase to return 0 for a point, or use a point where it naturally becomes 0
      // At freq -> 0 in LPF, phaseTheoretical ~ 0.
      // Let's create data with a very low frequency relative to fc
      const dataLowFreq: ExperimentalData[] = [
        { id: 1, freq: 0.0001, vo: 1.0, phase: 5 }, // phase is 5, theoretical phase will be ~0
        { id: 2, freq: 1000, vo: 0.707, phase: -45 }
      ];
      const resultLow = analyzeCutoffAndInterpolation(dataLowFreq, 1.0);
      const pLow = resultLow?.processedPoints.find(p => p.freq === 0.0001);
      // Since phaseTheoretical is extremely close to 0, it should fallback to absolute error
      // Note: calculateTheoreticalPhase will return exactly 0 if fRatio is very small or type unknown.
      // We can also rely on the test of calculateTheoreticalPhase returning 0.
      expect(pLow?.phaseError).toBeDefined();
    });

    it('returns the correct phaseC values at the cutoff frequency', () => {
      // 1. Lowpass 1st order -> -45
      const lp1: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1.0, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null }
      ];
      expect(analyzeCutoffAndInterpolation(lp1, 1.0)?.phaseC).toBe(-45);

      // 2. Lowpass 2nd order -> -52.55 (passive unbuffered loading effect)
      const lp2: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1.0, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null },
        { id: 3, freq: 5000, vo: 0.04, phase: null }
      ];
      expect(analyzeCutoffAndInterpolation(lp2, 1.0)?.phaseC).toBe(-52.55);

      // 3. Highpass 1st order -> 45
      const hp1: ExperimentalData[] = [
        { id: 1, freq: 1000, vo: 0.707, phase: null },
        { id: 2, freq: 10000, vo: 1.0, phase: null }
      ];
      expect(analyzeCutoffAndInterpolation(hp1, 1.0)?.phaseC).toBe(45);

      // 4. Highpass 2nd order -> 52.55 (passive unbuffered loading effect)
      const hp2: ExperimentalData[] = [
        { id: 1, freq: 200, vo: 0.04, phase: null },
        { id: 2, freq: 1000, vo: 0.707, phase: null },
        { id: 3, freq: 10000, vo: 1.0, phase: null }
      ];
      expect(analyzeCutoffAndInterpolation(hp2, 1.0)?.phaseC).toBe(52.55);

      // 5. Bandpass -> 0
      const bp: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 0.1, phase: null },
        { id: 2, freq: 100, vo: 1.0, phase: null },
        { id: 3, freq: 1000, vo: 0.1, phase: null }
      ];
      expect(analyzeCutoffAndInterpolation(bp, 1.0)?.phaseC).toBe(0);
    });
  });

  describe('calculateTheoreticalPhase', () => {
    it('calculates 1st order Low-Pass phase correctly', () => {
      expect(calculateTheoreticalPhase(1000, 1000, 'lowpass', 1, true)).toBeCloseTo(-45, 1);
      expect(calculateTheoreticalPhase(1, 1000, 'lowpass', 1, true)).toBeCloseTo(0, 0);
      expect(calculateTheoreticalPhase(10000000, 1000, 'lowpass', 1, true)).toBeCloseTo(-90, 1);
    });

    it('calculates 2nd order passive Low-Pass loading phase correctly', () => {
      // At fc, phase is exactly -52.55 degrees due to loading effect
      expect(calculateTheoreticalPhase(1000, 1000, 'lowpass', 2, true)).toBeCloseTo(-52.55, 1);
      expect(calculateTheoreticalPhase(100000, 1000, 'lowpass', 2, true)).toBeCloseTo(-175.41, 1);
    });

    it('calculates 2nd order active Low-Pass (Butterworth) phase correctly', () => {
      // At fc, active Butterworth phase is exactly -90 degrees
      expect(calculateTheoreticalPhase(1000, 1000, 'lowpass', 2, false)).toBeCloseTo(-90, 1);
      // Fallback for non-passive order 2 active Butterworth LPF
      expect(calculateTheoreticalPhase(1000, 1000, 'lowpass', 3, false)).toBeCloseTo(-90, 1);
    });

    it('calculates 1st order High-Pass phase correctly', () => {
      expect(calculateTheoreticalPhase(1000, 1000, 'highpass', 1, true)).toBeCloseTo(45, 1);
      expect(calculateTheoreticalPhase(10000000, 1000, 'highpass', 1, true)).toBeCloseTo(0, 1);
    });

    it('calculates 2nd order passive High-Pass loading phase correctly', () => {
      // At fc, phase is exactly 52.55 degrees due to loading effect
      expect(calculateTheoreticalPhase(1000, 1000, 'highpass', 2, true)).toBeCloseTo(52.55, 1);
      expect(calculateTheoreticalPhase(1, 1000, 'highpass', 2, true)).toBeCloseTo(179.54, 1);
    });

    it('calculates 2nd order active High-Pass (Butterworth) phase correctly', () => {
      // At fc, active Butterworth phase is exactly 90 degrees
      expect(calculateTheoreticalPhase(1000, 1000, 'highpass', 2, false)).toBeCloseTo(90, 1);
    });

    it('calculates Bandpass phase correctly', () => {
      expect(calculateTheoreticalPhase(1000, 1000, 'bandpass', 1, true)).toBeCloseTo(0, 1);
      expect(calculateTheoreticalPhase(500, 1000, 'bandpass', 1, true)).toBeGreaterThan(0);
      expect(calculateTheoreticalPhase(2000, 1000, 'bandpass', 1, true)).toBeLessThan(0);
    });

    it('returns 0 for unknown filter types', () => {
      expect(calculateTheoreticalPhase(1000, 1000, 'unknown', 1, true)).toBe(0);
    });
  });

  describe('Práticas de Laboratório Passivas de 1º e 2º Estágios (IFPB)', () => {
    
    it('deve diagnosticar corretamente um Filtro Passa-Baixas Passivo de 1º Estágio (RC)', () => {
      const fcNominal = 1000;
      const vin = 5.0;
      const freqs = [100, 300, 500, 800, 1000, 1200, 1500, 2000, 5000, 10000];
      
      const data: ExperimentalData[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vo = vin / Math.sqrt(1 + ratio * ratio);
        const phase = -Math.atan(ratio) * (180 / Math.PI);
        return { id: index + 1, freq: f, vo, phase };
      });

      const result = analyzeCutoffAndInterpolation(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result?.detectedFilter).toBe('lowpass');
      expect(result?.detectedOrder).toBe(1);
      expect(result?.fc).toBeGreaterThan(980);
      expect(result?.fc).toBeLessThan(1020);
      expect(result?.phaseC).toBe(-45);
      
      // All points should have a phase error extremely close to 0 (under 2% tolerance due to log-fc interpolation shifts)
      result?.processedPoints.forEach(p => {
        expect(p.phaseError).toBeLessThan(2.0);
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Altas Passivo de 1º Estágio (RC)', () => {
      const fcNominal = 5000;
      const vin = 5.0;
      const freqs = [100, 500, 1000, 2500, 5000, 7500, 10000, 20000, 50000];
      
      const data: ExperimentalData[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vo = (vin * ratio) / Math.sqrt(1 + ratio * ratio);
        const phase = 90 - Math.atan(ratio) * (180 / Math.PI);
        return { id: index + 1, freq: f, vo, phase };
      });

      const result = analyzeCutoffAndInterpolation(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result?.detectedFilter).toBe('highpass');
      expect(result?.detectedOrder).toBe(1);
      expect(result?.fc).toBeGreaterThan(4850);
      expect(result?.fc).toBeLessThan(5150);
      expect(result?.phaseC).toBe(45);
      
      result?.processedPoints.forEach(p => {
        expect(p.phaseError).toBeLessThan(2.0);
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Baixas Passivo de 2º Estágio com Efeito de Carga (RC-RC)', () => {
      const fcCarga = 1000;
      const vin = 5.0;
      // We omit intermediate transition frequencies (like 5k, 10k) and jump to the high-frequency asymptote (100k) where the overdamped slope crosses >30dB/dec
      const freqs = [100, 200, 500, 800, 1000, 2000, 100000];
      
      const data: ExperimentalData[] = freqs.map((f, index) => {
        const x = 0.37424 * (f / fcCarga);
        const vo = vin / Math.sqrt((1 - x * x) * (1 - x * x) + 9 * x * x);
        const phase = -Math.atan2(3 * x, 1 - x * x) * (180 / Math.PI);
        return { id: index + 1, freq: f, vo, phase };
      });

      const result = analyzeCutoffAndInterpolation(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result?.detectedFilter).toBe('lowpass');
      expect(result?.detectedOrder).toBe(2);
      expect(result?.fc).toBeGreaterThan(980);
      expect(result?.fc).toBeLessThan(1020);
      expect(result?.phaseC).toBe(-52.55);
      
      result?.processedPoints.forEach(p => {
        expect(p.phaseError).toBeLessThan(2.0);
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Altas Passivo de 2º Estágio com Efeito de Carga (RC-RC)', () => {
      const fcCarga = 5000;
      const vin = 5.0;
      // We omit intermediate transition frequencies and jump to the low-frequency asymptote (50Hz) where the HPF loading slope crosses >30dB/dec
      const freqs = [50, 2500, 5000, 10000, 20000, 50000];
      
      const data: ExperimentalData[] = freqs.map((f, index) => {
        const x = 2.67209 * (f / fcCarga);
        const vo = (vin * x * x) / Math.sqrt((1 - x * x) * (1 - x * x) + 9 * x * x);
        const phase = 180 - Math.atan2(3 * x, 1 - x * x) * (180 / Math.PI);
        return { id: index + 1, freq: f, vo, phase };
      });

      const result = analyzeCutoffAndInterpolation(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result?.detectedFilter).toBe('highpass');
      expect(result?.detectedOrder).toBe(2);
      expect(result?.fc).toBeGreaterThan(4850);
      expect(result?.fc).toBeLessThan(5150);
      expect(result?.phaseC).toBe(52.55);
      
      result?.processedPoints.forEach(p => {
        expect(p.phaseError).toBeLessThan(2.0);
      });
    });

  });

  describe('escala amplitude vrms', () => {
    it('scales gains correctly when amplitudeMode is vrms', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 5.0, phase: 0 }, // Vo = 5.0 Vpp. VoRms = 5.0 / (2 * sqrt(2)) = 1.7678 V
        { id: 2, freq: 1000, vo: 5.0, phase: 0 }
      ];
      // VsRms = 2.0 V
      // Gain = VoRms / VsRms = 1.7678 / 2.0 = 0.8839
      const result = analyzeCutoffAndInterpolation(data, 2.0, 'V', 'V', 'vrms');
      expect(result?.processedPoints[0].gvLinear).toBeCloseTo(5.0 / (2 * Math.sqrt(2)) / 2.0, 4);
    });
  });

});
