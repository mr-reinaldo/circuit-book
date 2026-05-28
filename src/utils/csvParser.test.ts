import { describe, it, expect } from 'vitest';
import { parseCsvContent } from './csvParser';

describe('csvParser', () => {

  describe('splitCsvLine (internal behavior tested via parseCsvContent)', () => {
    it('deve lidar com células entre aspas contendo o delimitador', () => {
      // "0,060" contendo vírgula com delimitador vírgula
      const csvData = `Hz,Vo (V)
100,"0,060"`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(0.06);
    });

    it('deve lidar com células entre aspas contendo ponto e vírgula com delimitador ponto e vírgula', () => {
      const csvData = `Hz;Vo (V);Fase
100;"1;25";-45`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].phase).toBe(-45); // if it had split "1;25", phase would be shifted or missing!
    });
  });

  describe('Detecção de Delimitador', () => {
    it('deve preferir vírgula se houver mais vírgulas do que pontos e vírgulas', () => {
      const csvData = `Hz,Vo,Fase
100,1.0,-45
200,0.8,-60`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(1.0);
    });

    it('deve preferir ponto e vírgula se houver mais pontos e vírgulas do que vírgulas', () => {
      const csvData = `Hz;Vo;Fase
100;1,0;-45
200;0,8;-60`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(1.0); // comma normalized to dot
    });

    it('deve usar vírgula como padrão se não houver delimitadores nas primeiras linhas', () => {
      const csvData = `Hz
Meta1
Meta2
Meta3
Meta4
100,1.0
200,0.8`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(1.0);
    });
  });

  describe('Extração de Metadados Globais (Vs / Vin)', () => {
    it('deve extrair Vs(Global) com unidade e valor corretamente', () => {
      const csvData = `Vs(Global),5 V
Hz,Vo
100,1`;
      const result = parseCsvContent(csvData);
      expect(result.globalValue).toBe(5);
      expect(result.globalUnit).toBe('V');
    });

    it('deve extrair Vin(Global) com unidade mV e decimal com vírgula corretamente', () => {
      const csvData = `Vin(Global),"120,5 mV"
Hz,Vo
100,1`;
      const result = parseCsvContent(csvData);
      expect(result.globalValue).toBe(120.5);
      expect(result.globalUnit).toBe('mV');
    });

    it('deve extrair Vs sem unidade (usando V como padrão)', () => {
      const csvData = `Vs,2.5
Hz,Vo
100,1`;
      const result = parseCsvContent(csvData);
      expect(result.globalValue).toBe(2.5);
      expect(result.globalUnit).toBe('V');
    });

    it('deve ignorar definição de metadados se o valor estiver em formato inválido', () => {
      const csvData = `Vs,invalido
Hz,Vo
100,1`;
      const result = parseCsvContent(csvData);
      expect(result.globalValue).toBeNull();
      expect(result.globalUnit).toBeNull();
    });

    it('deve lidar com variações de caixa (case-insensitive) para metadados', () => {
      const csvData = `vin(global),10 mV
Hz,Vo
100,1`;
      const result = parseCsvContent(csvData);
      expect(result.globalValue).toBe(10);
      expect(result.globalUnit).toBe('mV');
    });
  });

  describe('Mapeamento de Cabeçalhos e Flexibilidade de Colunas', () => {
    it('deve mapear corretamente colunas com acentos (ex: Frequência)', () => {
      const csvData = `Frequência,Vo,Fase
100,1.2,-30`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(1.2);
      expect(result.points[0].phase).toBe(-30);
    });

    it('deve mapear Vs(V) e Vs(mV) como coluna de saída Vo (comum em relatórios de alunos)', () => {
      const csvData = `Hz,Vs (mV)
100,500`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(500);
    });

    it('deve usar o mapeamento de fallback passivo se voColIdx for -1 mas existir "vs (mv)"', () => {
      const csvData = `Hz,Vs(mV)
100,250`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].vo).toBe(250);
    });

    it('deve mapear Vmax e Vmin para filtros ativos', () => {
      const csvData = `Hz,Max,Min
100,2.5,-2.5`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].vMax).toBe(2.5);
      expect(result.points[0].vMin).toBe(-2.5);
    });

    it('deve assumir posições padrão se nenhum cabeçalho for identificado', () => {
      const csvData = `100,1.25,-45
200,0.85,-60`;
      // Como não há cabeçalhos de texto, freqColIdx assume 0, voColIdx assume 1.
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(2);
      expect(result.points[0].freq).toBe(100);
      expect(result.points[0].vo).toBe(1.25);
    });
  });

  describe('Tratamento de Linhas e Valores', () => {
    it('deve retornar pontos vazios se o arquivo CSV for completamente em branco', () => {
      expect(parseCsvContent('').points).toHaveLength(0);
      expect(parseCsvContent('   ').points).toHaveLength(0);
    });

    it('deve ignorar linhas com menos colunas do que o índice máximo mapeado', () => {
      const csvData = `Hz,Vo,Fase
100,1.2,-30
200,1.0`; // Faltando a coluna de fase esperada
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1); // Apenas a primeira linha é válida
      expect(result.points[0].freq).toBe(100);
    });

    it('deve converter valores nulos em string ("N/A", "nao", "nan", "null") para null', () => {
      const csvData = `Hz,Vo,Fase
100,N/A,-45
200,1.0,nan
300,0.8,null
400,0.5,nao`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(4);
      expect(result.points[0].vo).toBeNull();
      expect(result.points[1].phase).toBeNull();
      expect(result.points[2].phase).toBeNull();
      expect(result.points[3].phase).toBeNull();
    });

    it('deve ignorar linhas com frequência nula, zerada ou negativa', () => {
      const csvData = `Hz,Vo
0,1.0
-100,0.8
N/A,0.5
100,1.2`;
      const result = parseCsvContent(csvData);
      expect(result.points).toHaveLength(1);
      expect(result.points[0].freq).toBe(100);
    });
  });

});
