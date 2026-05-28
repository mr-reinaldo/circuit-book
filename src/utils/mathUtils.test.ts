import { describe, it, expect } from 'vitest';
import { 
  parseEngineeringValue, 
  formatForInput, 
  formatEngineeringValue,
  analyzeCutoffAndInterpolation,
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
    });

    it('parses engineering suffixes correctly', () => {
      expect(parseEngineeringValue('1k')).toBe(1000);
      expect(parseEngineeringValue('2.2K')).toBe(2200);
      expect(parseEngineeringValue('1.5M')).toBe(1500000);
      expect(parseEngineeringValue('100m')).toBe(0.1);
      expect(parseEngineeringValue('47u')).toBe(0.000047);
      expect(parseEngineeringValue('47μ')).toBe(0.000047);
      expect(parseEngineeringValue('10n')).toBe(0.00000001);
      expect(parseEngineeringValue('5p')).toBe(0.000000000005);
    });

    it('handles decimal comma localization gracefully', () => {
      expect(parseEngineeringValue('1,5k')).toBe(1500);
    });

    it('rejects invalid inputs to prevent injection or crashes', () => {
      expect(parseEngineeringValue('hello')).toBeNaN();
      expect(parseEngineeringValue('1.5x')).toBeNaN();
      expect(parseEngineeringValue('')).toBeNaN();
    });
  });

  describe('formatForInput', () => {
    it('simplifies large and small numbers correctly for the input fields', () => {
      expect(formatForInput(1500)).toBe('1.5k');
      expect(formatForInput(1000000)).toBe('1M');
      expect(formatForInput(150)).toBe('150');
      expect(formatForInput(0)).toBe('0');
      expect(formatForInput(null)).toBe('');
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
  });

  describe('analyzeCutoffAndInterpolation', () => {
    it('returns null if there are fewer than 2 points', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1, phase: 0 }
      ];
      expect(analyzeCutoffAndInterpolation(data, 1.0)).toBeNull();
    });

    it('calculates gvLinear and gvDb correctly for valid points', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 100, vo: 1, phase: 0 },
        { id: 2, freq: 1000, vo: 0.1, phase: -90 }
      ];
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      expect(result?.processedPoints[0].gvLinear).toBe(1);
      expect(result?.processedPoints[0].gvDb).toBeCloseTo(0);
      expect(result?.processedPoints[1].gvLinear).toBe(0.1);
      expect(result?.processedPoints[1].gvDb).toBeCloseTo(-20);
    });

    it('finds the correct logarithmic cutoff frequency for a standard RC response (-3dB point)', () => {
      // Mocking a perfect RC Low Pass response where fc is around 1591 Hz
      const data: ExperimentalData[] = [
        { id: 1, freq: 1000, vo: 0.846, phase: -32 }, // gvDb ~ -1.45
        { id: 2, freq: 3000, vo: 0.468, phase: -62 }  // gvDb ~ -6.59
      ];
      
      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      
      // The interpolation algorithm draws a line between the points in log-space.
      // It should find fc somewhere between 1000 and 3000 Hz where gvDb crosses MaxDb - 3.01.
      expect(result?.fc).toBeGreaterThan(1000);
      expect(result?.fc).toBeLessThan(3000);
      
      // phaseC should also be interpolated successfully
      expect(result?.phaseC).toBeLessThan(-32);
      expect(result?.phaseC).toBeGreaterThan(-62);
    });

    it('interpolates missing phase values automatically', () => {
      const data: ExperimentalData[] = [
        { id: 1, freq: 10, vo: 1, phase: -5 },
        { id: 2, freq: 100, vo: 0.707, phase: null }, // Omitted to test interpolation
        { id: 3, freq: 1000, vo: 0.1, phase: -85 }
      ];

      const result = analyzeCutoffAndInterpolation(data, 1.0);
      expect(result).not.toBeNull();
      
      // Point at freq 100 should have a phase interpolated between -5 and -85
      const interpolatedPoint = result?.processedPoints.find(p => p.freq === 100);
      expect(interpolatedPoint?.phase).toBeDefined();
      expect(interpolatedPoint?.phase).toBeLessThan(-5);
      expect(interpolatedPoint?.phase).toBeGreaterThan(-85);
      expect(interpolatedPoint?.isInterpolated).toBe(true);
    });
  });

});
