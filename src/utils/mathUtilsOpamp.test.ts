import { describe, it, expect } from 'vitest';
import { analyzeOpampData, calculateTheoreticalPhaseOpamp, type OpampDataPoint, parseEngineeringValue, formatForInput, formatEngineeringValue } from './mathUtilsOpamp';

describe('mathUtilsOpamp', () => {

  it('deve calcular VppOut, Ganho Linear e Ganho em dB corretamente', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null },
      { id: '2', freq: 1000, vMax: 2.5, vMin: -2.5, phase: null }
    ];

    const result = analyzeOpampData(data, 1.0);
    
    expect(result.processedPoints[0].vppOut).toBe(10); // 5 - (-5)
    expect(result.processedPoints[0].gvLinear).toBe(10); // 10 / 1.0
    expect(result.processedPoints[0].gvDb).toBeCloseTo(20, 1); // 20*log10(10) = 20dB

    expect(result.processedPoints[1].vppOut).toBe(5); // 2.5 - (-2.5)
    expect(result.processedPoints[1].gvLinear).toBe(5); // 5 / 1.0
    expect(result.processedPoints[1].gvDb).toBeCloseTo(13.979, 1);
  });

  it('deve lidar corretamente com VinPp zerado ou inválido (evitando divisão por zero)', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null }
    ];

    const result = analyzeOpampData(data, 0); // VinPp 0 -> fallback para 1.0
    expect(result.processedPoints[0].gvLinear).toBe(10); // 10 / 1.0

    const resultNeg = analyzeOpampData(data, -5); // VinPp negativo -> fallback para 1.0
    expect(resultNeg.processedPoints[0].gvLinear).toBe(10);
  });

  it('deve lidar de forma robusta com valores invertidos ou trocados de vMax e vMin', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: -5, vMin: 5, phase: null } // Trocado intencionalmente
    ];

    const result = analyzeOpampData(data, 1.0);
    
    expect(result.processedPoints[0].vppOut).toBe(10); // | -5 - 5 | = 10
    expect(result.processedPoints[0].gvLinear).toBe(10);
    expect(result.processedPoints[0].gvDb).toBeCloseTo(20, 1);
  });

  it('deve ignorar cálculos e retornar valores originais se vMax ou vMin forem nulos ou frequencia for menor ou igual a zero', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: null, vMin: -5, phase: null },
      { id: '2', freq: -10, vMax: 5, vMin: -5, phase: null }
    ];

    const result = analyzeOpampData(data, 1.0);
    expect(result.processedPoints[0].gvLinear).toBeUndefined();
    expect(result.processedPoints[1].gvLinear).toBeUndefined();
  });

  it('deve converter corretamente multiplicadores de unidades (mV, uV)', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 500, vMin: -500, phase: null } // Voutpp = 1000 mV
    ];
    // Vin = 1 V, Vout = 1000 mV (1 V)
    const result = analyzeOpampData(data, 1.0, 'V', 'mV');
    expect(result.processedPoints[0].gvLinear).toBeCloseTo(1.0, 3);

    // Vin = 1000 mV (1 V), Vout = 1000 uV (0.001 V)
    const resultMicro = analyzeOpampData(data, 1000.0, 'mV', 'uV');
    expect(resultMicro.processedPoints[0].gvLinear).toBeCloseTo(1e-3, 9);
  });

  it('deve interpolar fases ausentes ou autogerar se todas forem ausentes', () => {
    // 1. Autogerar quando todas são nulas
    const dataNullPhase: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null },
      { id: '2', freq: 1000, vMax: 0.5, vMin: -0.5, phase: null } // fc em torno de 1000
    ];
    const resultAuto = analyzeOpampData(dataNullPhase, 1.0);
    expect(resultAuto.processedPoints[0].phase).toBeDefined();
    expect(resultAuto.processedPoints[0].phaseTheoretical).toBeDefined();
    expect(resultAuto.processedPoints[0].phaseError).toBe(0);

    // 2. Interpolar no meio
    const dataInterp: OpampDataPoint[] = [
      { id: '1', freq: 10, vMax: 5, vMin: -5, phase: 0 },
      { id: '2', freq: 100, vMax: 5, vMin: -5, phase: null }, // Omitido
      { id: '3', freq: 1000, vMax: 5, vMin: -5, phase: -90 }
    ];
    const resultInterp = analyzeOpampData(dataInterp, 1.0);
    expect(resultInterp.processedPoints[1].phase).toBeCloseTo(-45, 1);
    expect(resultInterp.processedPoints[1].isInterpolated).toBe(true);

    // 3. Fallback no início
    const dataStart: OpampDataPoint[] = [
      { id: '1', freq: 10, vMax: 5, vMin: -5, phase: null },
      { id: '2', freq: 100, vMax: 5, vMin: -5, phase: -45 },
      { id: '3', freq: 1000, vMax: 5, vMin: -5, phase: -90 }
    ];
    const resultStart = analyzeOpampData(dataStart, 1.0);
    expect(resultStart.processedPoints[0].phase).toBe(0);

    // 4. Fallback no fim
    const dataEnd: OpampDataPoint[] = [
      { id: '1', freq: 10, vMax: 5, vMin: -5, phase: 0 },
      { id: '2', freq: 100, vMax: 5, vMin: -5, phase: -45 },
      { id: '3', freq: 1000, vMax: 5, vMin: -5, phase: null }
    ];
    const resultEnd = analyzeOpampData(dataEnd, 1.0);
    expect(resultEnd.processedPoints[2].phase).toBe(0);
  });

  it('deve realizar interpolação logarítmica de alta precisão da frequência de corte', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 1000, vMax: 5, vMin: -5, phase: null }, // Voutpp = 10. GvLinear = 10
      { id: '2', freq: 10000, vMax: 0.5, vMin: -0.5, phase: null } // Voutpp = 1. GvLinear = 1
    ];
    // Target gv = 10 * 0.7071 = 7.071
    const result = analyzeOpampData(data, 1.0);
    expect(result.cutoffFreq).toBeGreaterThan(1000);
    expect(result.cutoffFreq).toBeLessThan(10000);
    expect(result.cutoffFreq).toBeCloseTo(2115.653, 1);
  });

  it('deve lidar com o caso em que o denominador é 0 durante a interpolação', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 1000, vMax: 3.5355, vMin: -3.5355, phase: null }, // Voutpp = 7.071. GvLinear = 7.071
      { id: '2', freq: 10000, vMax: 3.5355, vMin: -3.5355, phase: null } // Voutpp = 7.071. GvLinear = 7.071
    ];
    // maxGvLinear = 7.071. TargetGv = 7.071 * 0.7071 = 5.0.
    // Vamos definir os dois pontos para dar exatamente targetGv de ganho para forçar denom = 0
    const dataExact: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 3.5355, vMin: -3.5355, phase: null },
      { id: '2', freq: 1000, vMax: 3.5355, vMin: -3.5355, phase: null },
      { id: '3', freq: 10000, vMax: 5.0, vMin: -5.0, phase: null }
    ];
    const result = analyzeOpampData(dataExact, 1.0);
    // denom = 0, ratio = 0.5. logFc = log(100) + 0.5 * 1 = 2.5. fc = 316.22
    expect(result.cutoffFreq).toBeCloseTo(316.22, 1);
  });

  it('deve reverter para o ponto mais próximo se nenhum cruzamento de corte for detectado', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null }, // Vpp = 10, Gv = 10
      { id: '2', freq: 1000, vMax: 4.5, vMin: -4.5, phase: null } // Vpp = 9, Gv = 9
    ];
    // Target = 10 * 0.7071 = 7.071. Ambos são > 7.071, sem cruzamento.
    const result = analyzeOpampData(data, 1.0);
    // Deve pegar o ponto mais próximo de 7.071, que é o id '2' (9 é mais próximo de 7.071 do que 10)
    expect(result.cutoffFreq).toBe(1000);
    expect(result.closestToCutoffId).toBe('2');
  });

  it('deve detectar o tipo de filtro e a ordem (1a vs 2a) corretamente', () => {
    // 1. Lowpass 1a ordem
    const lp1Data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null },
      { id: '2', freq: 1000, vMax: 3.53, vMin: -3.53, phase: null }, // fc ~ 1000
      { id: '3', freq: 5000, vMax: 1.0, vMin: -1.0, phase: null } // slope ~ 20dB/dec
    ];
    expect(analyzeOpampData(lp1Data, 1.0).detectedFilter).toBe('lowpass');
    expect(analyzeOpampData(lp1Data, 1.0).detectedOrder).toBe(1);

    // 2. Highpass 2a ordem
    const hp2Data: OpampDataPoint[] = [
      { id: '1', freq: 200, vMax: 0.2, vMin: -0.2, phase: null },
      { id: '2', freq: 1000, vMax: 3.53, vMin: -3.53, phase: null }, // fc ~ 1000
      { id: '3', freq: 10000, vMax: 5.0, vMin: -5.0, phase: null }
    ];
    expect(analyzeOpampData(hp2Data, 1.0).detectedFilter).toBe('highpass');
    expect(analyzeOpampData(hp2Data, 1.0).detectedOrder).toBe(2);
  });

  it('deve calcular corretamente a margem de erro de fase em relação à fase teórica', () => {
    const data: OpampDataPoint[] = [
      { id: '1', freq: 100, vMax: 5, vMin: -5, phase: -5 },
      { id: '2', freq: 1000, vMax: 3.535, vMin: -3.535, phase: -45 }
    ];
    const result = analyzeOpampData(data, 1.0);
    expect(result.processedPoints[0].phaseError).toBeDefined();
    expect(result.processedPoints[0].phaseError).toBeGreaterThan(0);
  });

  describe('calculateTheoreticalPhaseOpamp', () => {
    it('calculates 1st order Low-Pass phase correctly', () => {
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'lowpass', 1)).toBeCloseTo(-45, 1);
      expect(calculateTheoreticalPhaseOpamp(10000000, 1000, 'lowpass', 1)).toBeCloseTo(-90, 1);
    });

    it('calculates 2nd order Low-Pass Cascata Ideal phase correctly', () => {
      // At fc, phase is exactly -90 degrees (-2 * 45 = -90)
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'lowpass', 2)).toBeCloseTo(-90, 1);
      expect(calculateTheoreticalPhaseOpamp(10000000, 1000, 'lowpass', 2)).toBeCloseTo(-180, 1);
    });

    it('calculates 1st order High-Pass phase correctly', () => {
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'highpass', 1)).toBeCloseTo(45, 1);
      expect(calculateTheoreticalPhaseOpamp(10000000, 1000, 'highpass', 1)).toBeCloseTo(0, 1);
    });

    it('calculates 2nd order High-Pass Cascata Ideal phase correctly', () => {
      // At fc, phase is exactly 90 degrees (2 * 45 = 90)
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'highpass', 2)).toBeCloseTo(90, 1);
      expect(calculateTheoreticalPhaseOpamp(1, 1000, 'highpass', 2)).toBeCloseTo(180, 0);
    });

    it('calculates Bandpass phase correctly', () => {
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'bandpass', 1)).toBeCloseTo(0, 1);
    });

    it('returns 0 for unknown filter types', () => {
      expect(calculateTheoreticalPhaseOpamp(1000, 1000, 'unknown', 1)).toBe(0);
    });
  });

  describe('isolated engineering unit helpers', () => {
    it('should parse engineering values correctly', () => {
      expect(parseEngineeringValue('1k')).toBe(1000);
      expect(parseEngineeringValue('1.5k')).toBe(1500);
      expect(parseEngineeringValue('1,5k')).toBe(1500); // normalized comma
      expect(parseEngineeringValue('100n')).toBeCloseTo(100e-9, 12);
      expect(parseEngineeringValue('2.2M')).toBe(2.2e6);
      expect(parseEngineeringValue('10u')).toBeCloseTo(10e-6, 12);
      expect(parseEngineeringValue('invalid')).toBeNaN();
    });

    it('should format values for inputs correctly', () => {
      expect(formatForInput(1000)).toBe('1k');
      expect(formatForInput(1500000)).toBe('1.5M');
      expect(formatForInput(1500)).toBe('1.5k');
      expect(formatForInput(12.34)).toBe('12.34');
      expect(formatForInput(null)).toBe('');
    });

    it('should format values as elegant engineering notation', () => {
      expect(formatEngineeringValue(1000, 'Hz')).toBe('1.00 kHz');
      expect(formatEngineeringValue(1500000, 'Hz')).toBe('1.50 MHz');
      expect(formatEngineeringValue(12.34, 'V')).toBe('12.34 V');
      expect(formatEngineeringValue(10e-9, 'F')).toBe('10.00 nF');
      expect(formatEngineeringValue(NaN)).toBe('N/A');
    });
  });

  describe('classification robustness with null/zero gain', () => {
    it('should classify filter type correctly even under presence of -Infinity gain points', () => {
      // 100Hz -> 0 gain (linear 0 -> dB -Infinity)
      // 1000Hz -> 5 gain (linear 5 -> dB 13.97) - fc
      // 10000Hz -> 5 gain (linear 5 -> dB 13.97)
      const data: OpampDataPoint[] = [
        { id: '1', freq: 100, vMax: 0, vMin: 0, phase: null }, // Gain = 0 (-Infinity dB)
        { id: '2', freq: 1000, vMax: 2.5, vMin: -2.5, phase: null },
        { id: '3', freq: 10000, vMax: 2.5, vMin: -2.5, phase: null }
      ];

      const result = analyzeOpampData(data, 1.0);
      expect(result.detectedFilter).toBe('highpass'); // startGain cap/filter works and detects HPF correctly!
      expect(result.detectedOrder).toBe(1);
    });
  });

  describe('Práticas de Laboratório Ativas de 1º e 2º Estágios (OpAmp - IFPB)', () => {
    
    it('deve diagnosticar corretamente um Filtro Passa-Baixas Ativo de 1º Estágio (RC)', () => {
      const fcNominal = 1000;
      const vin = 1.0;
      const freqs = [100, 300, 500, 800, 1000, 1200, 1500, 2000, 5000, 10000];
      
      const data: OpampDataPoint[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vppOut = vin / Math.sqrt(1 + ratio * ratio);
        const phase = -Math.atan(ratio) * (180 / Math.PI);
        return {
          id: `pt-${index + 1}`,
          freq: f,
          vMax: vppOut / 2,
          vMin: -vppOut / 2,
          phase
        };
      });

      const result = analyzeOpampData(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result.detectedFilter).toBe('lowpass');
      expect(result.detectedOrder).toBe(1);
      expect(result.cutoffFreq).toBeGreaterThan(980);
      expect(result.cutoffFreq).toBeLessThan(1020);
      
      result.processedPoints.forEach(p => {
        expect(p.phaseError).toBeDefined();
        expect(p.phaseError).toBeLessThan(0.5); // very high precision absolute phase error in degrees
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Altas Ativo de 1º Estágio (RC)', () => {
      const fcNominal = 5000;
      const vin = 1.0;
      const freqs = [100, 500, 1000, 2500, 5000, 7500, 10000, 20000, 50000];
      
      const data: OpampDataPoint[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vppOut = (vin * ratio) / Math.sqrt(1 + ratio * ratio);
        const phase = Math.atan(fcNominal / f) * (180 / Math.PI);
        return {
          id: `pt-${index + 1}`,
          freq: f,
          vMax: vppOut / 2,
          vMin: -vppOut / 2,
          phase
        };
      });

      const result = analyzeOpampData(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result.detectedFilter).toBe('highpass');
      expect(result.detectedOrder).toBe(1);
      expect(result.cutoffFreq).toBeGreaterThan(4850);
      expect(result.cutoffFreq).toBeLessThan(5150);
      
      result.processedPoints.forEach(p => {
        expect(p.phaseError).toBeDefined();
        expect(p.phaseError).toBeLessThan(0.5);
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Baixas Ativo de 2º Estágio (Cascata Ideal)', () => {
      const fcNominal = 1000;
      const fcOverall = fcNominal * Math.sqrt(Math.sqrt(2) - 1); // True overall physical cutoff ~643.59 Hz
      const vin = 1.0;
      // High frequency asymptote (100kHz) to register decibel slope > 30dB/dec
      const freqs = [100, 200, 500, 800, 1000, 2000, 100000];
      
      const data: OpampDataPoint[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vppOut = vin / (1 + ratio * ratio); // isolated cascaded 1st order active filters gain
        const phase = -2 * Math.atan(f / fcOverall) * (180 / Math.PI); // aligned with overall cutoff theoretical phase
        return {
          id: `pt-${index + 1}`,
          freq: f,
          vMax: vppOut / 2,
          vMin: -vppOut / 2,
          phase
        };
      });

      const result = analyzeOpampData(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result.detectedFilter).toBe('lowpass');
      expect(result.detectedOrder).toBe(2);
      expect(result.cutoffFreq).toBeGreaterThan(620);
      expect(result.cutoffFreq).toBeLessThan(660);
      
      result.processedPoints.forEach(p => {
        expect(p.phaseError).toBeDefined();
        expect(p.phaseError).toBeLessThan(2.0); // realistic interpolation tolerance
      });
    });

    it('deve diagnosticar corretamente um Filtro Passa-Altas Ativo de 2º Estágio (Cascata Ideal)', () => {
      const fcNominal = 5000;
      const fcOverall = fcNominal / Math.sqrt(Math.sqrt(2) - 1); // True overall physical cutoff ~7768.9 Hz
      const vin = 1.0;
      // Low frequency asymptote (50Hz) to register decibel slope > 30dB/dec
      const freqs = [50, 2500, 5000, 10000, 20000, 50000];
      
      const data: OpampDataPoint[] = freqs.map((f, index) => {
        const ratio = f / fcNominal;
        const vppOut = vin * (ratio * ratio) / (1 + ratio * ratio); // isolated cascaded 1st order active filters gain
        const phase = 2 * Math.atan(fcOverall / f) * (180 / Math.PI); // aligned with overall cutoff theoretical phase
        return {
          id: `pt-${index + 1}`,
          freq: f,
          vMax: vppOut / 2,
          vMin: -vppOut / 2,
          phase
        };
      });

      const result = analyzeOpampData(data, vin, 'V', 'V');
      expect(result).not.toBeNull();
      expect(result.detectedFilter).toBe('highpass');
      expect(result.detectedOrder).toBe(2);
      expect(result.cutoffFreq).toBeGreaterThan(7500);
      expect(result.cutoffFreq).toBeLessThan(8200);
      
      result.processedPoints.forEach(p => {
        expect(p.phaseError).toBeDefined();
        expect(p.phaseError).toBeLessThan(2.0); // realistic interpolation tolerance
      });
    });

  });

  describe('escala amplitude vrms', () => {
    it('deve escalar corretamente os ganhos quando amplitudeMode é vrms', () => {
      const data: OpampDataPoint[] = [
        { id: '1', freq: 100, vMax: 5, vMin: -5, phase: null } // Voutpp = 10 V. VoutRms = 10 / (2 * sqrt(2)) = 3.5355 V
      ];
      // VinRms = 2.0 V.
      // Gain = VoutRms / VinRms = 3.5355 / 2.0 = 1.7678
      const result = analyzeOpampData(data, 2.0, 'V', 'V', 'vrms');
      expect(result.processedPoints[0].gvLinear).toBeCloseTo(10 / (2 * Math.sqrt(2)) / 2.0, 4);
      expect(result.processedPoints[0].gvDb).toBeCloseTo(20 * Math.log10(10 / (2 * Math.sqrt(2)) / 2.0), 3);
    });
  });

});
