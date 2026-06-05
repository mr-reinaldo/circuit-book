<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';
import { getUnitMultiplier } from '../../../utils/mathUtilsOpamp';
import type { OpampDataPoint } from '../../../utils/mathUtilsOpamp';

const props = defineProps<{
  selectedPoint: OpampDataPoint | null; // Selected row point in active focus
  fc: number | null; // Cutoff frequency
  maxGvDb: number;
  detectedFilter?: string;
  detectedOrder?: number;
  globalVs: number;
  globalVsUnit?: string;
  globalVoutUnit?: string;
  amplitudeMode: 'vpp' | 'vrms';
}>();

// Helper to format values for display
function formatNum(val: number | null | undefined, dec = 3): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return val.toFixed(dec).replace('.', ',');
}

// Compute the LaTeX for Magnitude equation
const magnitudeLatex = computed(() => {
  if (!props.selectedPoint) {
    return katex.renderToString('\\text{Selecione um ponto na tabela para visualizar o cálculo de ganho}', { throwOnError: false });
  }

  const p = props.selectedPoint;
  
  const vMax = p.vMax !== null ? p.vMax : 0;
  const vMin = p.vMin !== null ? p.vMin : 0;
  const vppOut = Math.abs(vMax - vMin);
  const vin = props.globalVs;

  const vinUnit = props.globalVsUnit || 'V';
  const voutUnit = props.globalVoutUnit || 'V';

  const vinMult = getUnitMultiplier(vinUnit);
  const voutMult = getUnitMultiplier(voutUnit);

  const vinVolts = vin * vinMult;
  const vMaxVolts = vMax * voutMult;
  const vMinVolts = vMin * voutMult;
  const vppOutVolts = vppOut * voutMult;

  const gv = p.gvLinear !== undefined && !isNaN(p.gvLinear) ? p.gvLinear : (vppOutVolts / vinVolts);

  let formula = '';
  let substitution = '';

  if (props.amplitudeMode === 'vrms') {
    const voutRmsVolts = vppOutVolts / (2 * Math.sqrt(2));

    formula = 'V_{out\\text{ (pp)}} = |V_{max} - V_{min}| \\cdot \\text{mult}_{Vout} \\quad , \\quad V_{out\\text{ (rms)}} = \\frac{V_{out\\text{ (pp)}}}{2\\sqrt{2}} \\quad \\text{e} \\quad A_v = \\frac{V_{out\\text{ (rms)}}}{V_{in} \\cdot \\text{mult}_{Vin}}';
    
    let subLines = [];
    if (voutUnit !== 'V') {
      subLines.push(`V_{max\\text{ (V)}} = ${formatNum(vMax)}\\text{ ${voutUnit}} = ${formatNum(vMaxVolts, 4)}\\text{ V}`);
      subLines.push(`V_{min\\text{ (V)}} = ${formatNum(vMin)}\\text{ ${voutUnit}} = ${formatNum(vMinVolts, 4)}\\text{ V}`);
    }
    if (vinUnit !== 'V') {
      subLines.push(`V_{in\\text{ (V)}} = ${formatNum(vin)}\\text{ ${vinUnit}} = ${formatNum(vinVolts, 4)}\\text{ V}`);
    }
    subLines.push(`V_{out\\text{ (pp)}} = |${formatNum(vMaxVolts, 4)}\\text{ V} - (${formatNum(vMinVolts, 4)}\\text{ V})| = ${formatNum(vppOutVolts, 4)}\\text{ V}`);
    subLines.push(`V_{out\\text{ (rms)}} = \\frac{${formatNum(vppOutVolts, 4)}\\text{ V}}{2\\sqrt{2}} = ${formatNum(voutRmsVolts, 4)}\\text{ V}`);
    subLines.push(`A_v = \\frac{${formatNum(voutRmsVolts, 4)}\\text{ V}}{${formatNum(vinVolts, 4)}\\text{ V}} = ${formatNum(gv, 4)}`);

    substitution = subLines.join(' \\\\ ');
  } else {
    formula = 'V_{out\\text{ (pp)}} = |V_{max} - V_{min}| \\cdot \\text{mult}_{Vout} \\quad \\text{e} \\quad A_v = \\frac{V_{out\\text{ (pp)}}}{V_{in} \\cdot \\text{mult}_{Vin}}';

    let subLines = [];
    if (voutUnit !== 'V') {
      subLines.push(`V_{max\\text{ (V)}} = ${formatNum(vMax)}\\text{ ${voutUnit}} = ${formatNum(vMaxVolts, 4)}\\text{ V}`);
      subLines.push(`V_{min\\text{ (V)}} = ${formatNum(vMin)}\\text{ ${voutUnit}} = ${formatNum(vMinVolts, 4)}\\text{ V}`);
    }
    if (vinUnit !== 'V') {
      subLines.push(`V_{in\\text{ (V)}} = ${formatNum(vin)}\\text{ ${vinUnit}} = ${formatNum(vinVolts, 4)}\\text{ V}`);
    }
    subLines.push(`V_{out\\text{ (pp)}} = |${formatNum(vMaxVolts, 4)}\\text{ V} - (${formatNum(vMinVolts, 4)}\\text{ V})| = ${formatNum(vppOutVolts, 4)}\\text{ V}`);
    subLines.push(`A_v = \\frac{${formatNum(vppOutVolts, 4)}\\text{ V}}{${formatNum(vinVolts, 4)}\\text{ V}} = ${formatNum(gv, 4)}`);

    substitution = subLines.join(' \\\\ ');
  }

  const latex = `\\begin{aligned}
    \\textbf{Fórmulas:} \\quad & ${formula} \\\\
    \\textbf{Substituição:} \\quad & ${substitution}
  \\end{aligned}`;

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
});

// Compute the LaTeX for Decibel conversion
const dbLatex = computed(() => {
  if (!props.selectedPoint) return '';

  const p = props.selectedPoint;
  const gvLinear = p.gvLinear !== undefined && !isNaN(p.gvLinear) ? p.gvLinear : 0;
  const gvDb = p.gvDb !== undefined && !isNaN(p.gvDb) ? p.gvDb : (gvLinear > 0 ? 20 * Math.log10(gvLinear) : -Infinity);

  const formula = 'A_{v\\text{ (dB)}} = 20 \\log_{10}(|A_v|)';
  const substitution = `A_{v\\text{ (dB)}} = 20 \\log_{10}(|${formatNum(gvLinear, 4)}|) = ${formatNum(gvDb, 2)}\\text{ dB}`;

  const latex = `\\begin{aligned}
    \\textbf{Fórmula:} \\quad & ${formula} \\\\
    \\textbf{Cálculo:} \\quad & ${substitution}
  \\end{aligned}`;

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
});

// Compute the LaTeX for Phase Error
const phaseLatex = computed(() => {
  if (!props.selectedPoint || props.fc === null) return '';

  const p = props.selectedPoint;
  const measured = p.phase;
  const theoretical = p.phaseTheoretical;
  const error = p.phaseError;
  const isInterp = !!p.isInterpolated;

  if (measured === null || theoretical === undefined || isNaN(theoretical)) {
    return katex.renderToString('\\text{Fase teórica para este ponto: } \\theta_{\\text{teor}} = ' + formatNum(theoretical, 1) + '^\\circ', { throwOnError: false });
  }

  if (isInterp) {
    const latex = `\\begin{aligned}
      \\textbf{Fase Teórica } (\\theta_{\\text{teor}}): \\quad & ${formatNum(theoretical, 1)}^\\circ \\\\
      \\textbf{Nota de Bancada:} \\quad & \\text{Como a fase na frequência de } ${formatNum(p.freq, 1)}\\text{ Hz não foi preenchida,} \\\\
      & \\text{o analisador calculou o valor teórico/interpolado automaticamente: } \\\\
      & \\theta = ${formatNum(measured, 1)}^\\circ \\\\
      & \\text{A margem de erro prática é de } 0\\text{ graus (ajuste perfeito ao modelo).}
    \\end{aligned}`;
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  }

  const formula = '\\theta_{\\text{erro}} = |\\theta_{medido} - \\theta_{\\text{teor}}|';
  const substitution = `\\theta_{\\text{erro}} = |${formatNum(measured, 2)}^\\circ - (${formatNum(theoretical, 2)}^\\circ)| = ${formatNum(error, 2)}^\\circ`;

  const latex = `\\begin{aligned}
    \\textbf{Fase Teórica } (\\theta_{\\text{teor}}): \\quad & ${formatNum(theoretical, 2)}^\\circ \\\\
    \\textbf{Erro de Fase (Graus):} \\quad & ${formula} \\\\
    \\textbf{Cálculo Prático:} \\quad & ${substitution}
  \\end{aligned}`;

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
});

// Compute the Cutoff Frequency theoretical formula card
const cutoffFormulaLatex = computed(() => {
  if (props.fc === null) {
    return katex.renderToString('\\text{Insira ou importe dados experimentais para diagnosticar e visualizar as equações.}', { throwOnError: false });
  }

  const filterType = props.detectedFilter || 'lowpass';
  const order = props.detectedOrder || 1;
  
  let label = '';
  let formula = '';
  let phaseCVal = '';
  
  if (filterType === 'lowpass') {
    if (order === 1) {
      label = 'Filtro Passa-Baixas Ativo (LPF) de 1a. Ordem';
      formula = 'f_c = \\frac{1}{2\\pi R C} \\quad \\Rightarrow \\quad \\theta(f_c) = -45^\\circ';
      phaseCVal = '-45^\\circ';
    } else {
      label = `Filtro Passa-Baixas Ativo (LPF) de ${order}a. Ordem (Cascata Ideal)`;
      formula = 'f_c = \\frac{1}{2\\pi \\sqrt{R_1 R_2 C_1 C_2}} \\quad \\Rightarrow \\quad \\theta(f_c) = -90^\\circ';
      phaseCVal = '-90^\\circ';
    }
  } else if (filterType === 'highpass') {
    if (order === 1) {
      label = 'Filtro Passa-Altas Ativo (HPF) de 1a. Ordem';
      formula = 'f_c = \\frac{1}{2\\pi R C} \\quad \\Rightarrow \\quad \\theta(f_c) = 45^\\circ';
      phaseCVal = '45^\\circ';
    } else {
      label = `Filtro Passa-Altas Ativo (HPF) de ${order}a. Ordem (Cascata Ideal)`;
      formula = 'f_c = \\frac{1}{2\\pi \\sqrt{R_1 R_2 C_1 C_2}} \\quad \\Rightarrow \\quad \\theta(f_c) = 90^\\circ';
      phaseCVal = '90^\\circ';
    }
  } else {
    label = 'Filtro Seletivo Passa-Banda Ativo (BPF)';
    formula = 'f_0 = \\frac{1}{2\\pi \\sqrt{L C}} \\quad \\Rightarrow \\quad \\theta(f_0) = 0^\\circ';
    phaseCVal = '0^\\circ';
  }

  let fcText = props.fc >= 1000 ? `${(props.fc / 1000).toFixed(3)} kHz` : `${props.fc.toFixed(1)} Hz`;

  const maxGvLinear = Math.pow(10, props.maxGvDb / 20);
  const targetGv = maxGvLinear * 0.7071;
  const targetGvDb = props.maxGvDb - 3.0103;

  const latex = `\\begin{aligned}
    \\textbf{Filtro Diagnosticado:} \\quad & \\text{${label}} \\\\
    \\textbf{Ganho Máximo do Circuito } (A_{v,\\text{max}}): \\quad & ${formatNum(maxGvLinear, 4)} \\quad (${formatNum(props.maxGvDb, 2)}\\text{ dB}) \\\\
    \\textbf{Ganho de Corte Alvo } (0,707 \\cdot A_{v,\\text{max}}): \\quad & ${formatNum(targetGv, 4)} \\quad (${formatNum(targetGvDb, 2)}\\text{ dB}) \\\\
    \\textbf{Frequência de Corte Identificada } (f_c): \\quad & \\mathbf{${fcText.replace('.', ',')}} \\\\
    \\textbf{Equação da Freq. Corte:} \\quad & ${formula} \\\\
    \\textbf{Fase Teórica em } f_c: \\quad & \\theta_{\\text{teor}}(f_c) = ${phaseCVal}
  \\end{aligned}`;

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
});

function formatFreq(f: number): string {
  if (f >= 1000) return `${(f / 1000).toFixed(2)} kHz`;
  return `${f.toFixed(1)} Hz`;
}
</script>

<template>
  <div class="cb-card p-5">
    <div class="cb-card-header">
      <span class="accent-dot"></span>
      <h2>Equações e Fundamentação Científica (KaTeX) - Filtros Ativos</h2>
    </div>
    <p class="cb-subtitle mb-5">
      Abaixo são expostas as equações que regem o comportamento físico dos filtros ativos baseados em OpAmps, demonstrando as substituições passo a passo com base nos dados experimentais.
    </p>

    <!-- Active Focus Indicator bar -->
    <div v-if="selectedPoint" class="mb-5 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs" style="background:var(--primary-surface);border:1px solid var(--primary-border);border-radius:var(--radius-md);color:var(--text-secondary)">
      <div class="flex items-center gap-2 font-sans">
        <span class="material-symbols-outlined text-[18px]" style="color:var(--primary-text)">analytics</span>
        <span>Exibindo passo a passo para a frequência de: <strong class="font-mono text-sm ml-1" style="color:var(--primary-text)">{{ formatFreq(selectedPoint.freq) }}</strong></span>
      </div>
      <div class="flex items-center gap-1.5 self-start sm:self-auto">
        <span v-if="selectedPoint.freq === fc" class="cb-status" style="background:var(--warning-surface);color:var(--warning-text);border:1px solid rgba(217,119,6,0.2);font-size:10px">
          <span class="material-symbols-outlined text-[12px]">filter_alt</span> Frequência de Corte (fc)
        </span>
        <span v-else class="cb-status" style="background:var(--primary-surface);color:var(--primary-text);border:1px solid var(--primary-border);font-size:10px">
          <span class="material-symbols-outlined text-[12px]">visibility</span> Ponto Empírico Focado
        </span>
      </div>
    </div>

    <!-- Equations Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      
      <!-- Freq de Corte / Heuristica (Spans 2 columns on desktop to provide ample math space) -->
      <div class="md:col-span-2 cb-inset p-4 flex flex-col justify-center min-h-[140px] text-xs font-mono overflow-x-auto" style="color:var(--text-primary)">
        <h3 class="cb-section-label mb-2">1. Diagnóstico do Filtro e Frequência de Corte</h3>
        <div v-html="cutoffFormulaLatex" class="math-container"></div>
      </div>

      <!-- Selected point: Magnitude linear -->
      <div class="cb-inset p-4 flex flex-col justify-center min-h-[140px] text-xs font-mono overflow-x-auto" style="color:var(--text-primary)">
        <h3 class="cb-section-label mb-2">2. Ganho de Tensão (Magnitude Linear)</h3>
        <div v-html="magnitudeLatex" class="math-container"></div>
      </div>

      <!-- Selected point: dB Gain -->
      <div class="cb-inset p-4 flex flex-col justify-center min-h-[140px] text-xs font-mono overflow-x-auto" style="color:var(--text-primary)">
        <h3 class="cb-section-label mb-2">3. Conversão Logarítmica (Decibéis)</h3>
        <div v-html="dbLatex" class="math-container"></div>
      </div>

      <!-- Selected point: Phase Error margins (Spans 2 columns on desktop for detailed feedback notes) -->
      <div class="md:col-span-2 cb-inset p-4 flex flex-col justify-center min-h-[140px] text-xs font-mono overflow-x-auto" style="color:var(--text-primary)">
        <h3 class="cb-section-label mb-2">4. Margem de Erro de Fase (θ) - Erro Absoluto</h3>
        <div v-html="phaseLatex" class="math-container"></div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.math-container {
  overflow-x: auto;
  padding: 4px 0;
  width: 100%;
}
:deep(.katex-display) {
  margin: 0.25em 0 !important;
  overflow-x: auto;
  overflow-y: hidden;
}
:deep(.katex) {
  font-size: 0.96em !important;
  white-space: nowrap;
}
</style>
