<script setup lang="ts">
import { computed } from 'vue';
import katex from 'katex';

const props = defineProps<{
  selectedPoint: any | null; // Selected row point in active focus
  fc: number | null; // Cutoff frequency
  maxGvDb: number;
  detectedFilter?: string;
  detectedOrder?: number;
  globalVs: number;
  globalVsUnit?: string;
  isOpamp?: boolean;
  amplitudeMode?: 'vpp' | 'vrms';
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
  const isOp = !!props.isOpamp;
  
  let formula = '';
  let substitution = '';
  
  if (isOp) {
    const vMax = p.vMax !== null ? p.vMax : 0;
    const vMin = p.vMin !== null ? p.vMin : 0;
    const vppOut = Math.abs(vMax - vMin);
    const vin = props.globalVs;

    if (props.amplitudeMode === 'vrms') {
      const voutRms = vppOut / (2 * Math.sqrt(2));
      const gv = voutRms / vin;

      formula = 'V_{out\\text{ (pp)}} = |V_{max} - V_{min}| \\quad , \\quad V_{out\\text{ (rms)}} = \\frac{V_{out\\text{ (pp)}}}{2\\sqrt{2}} \\quad \\text{e} \\quad A_v = \\frac{V_{out\\text{ (rms)}}}{V_{in\\text{ (rms)}}}';
      substitution = `V_{out\\text{ (pp)}} = |${formatNum(vMax)} - (${formatNum(vMin)})| = ${formatNum(vppOut)}\\text{ V}`;
      substitution += `\\\\ V_{out\\text{ (rms)}} = \\frac{${formatNum(vppOut)}\\text{ V}}{2\\sqrt{2}} = ${formatNum(voutRms)}\\text{ V}`;
      substitution += `\\\\ A_v = \\frac{${formatNum(voutRms)}\\text{ V}}{${formatNum(vin)}\\text{ V}} = ${formatNum(gv, 4)}`;
    } else {
      const gv = vppOut / vin;

      formula = 'V_{out\\text{ (pp)}} = |V_{max} - V_{min}| \\quad \\text{e} \\quad A_v = \\frac{V_{out\\text{ (pp)}}}{V_{in\\text{ (pp)}}}';
      substitution = `V_{out\\text{ (pp)}} = |${formatNum(vMax)} - (${formatNum(vMin)})| = ${formatNum(vppOut)}\\text{ V}`;
      substitution += `\\\\ A_v = \\frac{${formatNum(vppOut)}\\text{ V}}{${formatNum(vin)}\\text{ V}} = ${formatNum(gv, 4)}`;
    }
  } else {
    const vo = p.vo !== null ? p.vo : 0;
    const vs = props.globalVs;

    if (props.amplitudeMode === 'vrms') {
      const voRms = vo / (2 * Math.sqrt(2));
      const gv = voRms / vs;

      formula = 'V_{o\\text{ (rms)}} = \\frac{V_o}{2\\sqrt{2}} \\quad \\text{e} \\quad G_v = \\frac{V_{o\\text{ (rms)}}}{V_s}';
      substitution = `V_{o\\text{ (rms)}} = \\frac{${formatNum(vo)}\\text{ V}}{2\\sqrt{2}} = ${formatNum(voRms)}\\text{ V}`;
      substitution += `\\\\ G_v = \\frac{${formatNum(voRms)}\\text{ V}}{${formatNum(vs)}\\text{ V}} = ${formatNum(gv, 4)}`;
    } else {
      const gv = vo / vs;

      formula = 'G_v = \\frac{V_o}{V_s}';
      substitution = `G_v = \\frac{${formatNum(vo)}\\text{ V}}{${formatNum(vs)}\\text{ V}} = ${formatNum(gv, 4)}`;
    }
  }

  const latex = `\\begin{aligned}
    \\textbf{Formulas:} \\quad & ${formula} \\\\
    \\textbf{Substituicao:} \\quad & ${substitution}
  \\end{aligned}`;

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
});

// Compute the LaTeX for Decibel conversion
const dbLatex = computed(() => {
  if (!props.selectedPoint) return '';

  const p = props.selectedPoint;
  const gvLinear = props.isOpamp ? (p.gvLinear || 0) : (p.vo / props.globalVs);
  const gvDb = gvLinear > 0 ? 20 * Math.log10(gvLinear) : -Infinity;

  const formula = 'A_{v\\text{ (dB)}} = 20 \\log_{10}(|A_v|)';
  const substitution = `A_{v\\text{ (dB)}} = 20 \\log_{10}(|${formatNum(gvLinear, 4)}|) = ${formatNum(gvDb, 2)}\\text{ dB}`;

  const latex = `\\begin{aligned}
    \\textbf{Formula:} \\quad & ${formula} \\\\
    \\textbf{Calculo:} \\quad & ${substitution}
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
  const isOp = !!props.isOpamp;

  if (measured === null || theoretical === undefined || isNaN(theoretical)) {
    return katex.renderToString('\\text{Fase teórica para este ponto: } \\theta_{\\text{teor}} = ' + formatNum(theoretical, 1) + '^\\circ', { throwOnError: false });
  }

  if (isInterp) {
    const latex = `\\begin{aligned}
      \\textbf{Fase Teorica } (\\theta_{\\text{teor}}): \\quad & ${formatNum(theoretical, 1)}^\\circ \\\\
      \\textbf{Nota de Bancada:} \\quad & \\text{Como a fase na frequencia de } ${formatNum(p.freq, 1)}\\text{ Hz nao foi preenchida,} \\\\
      & \\text{o Circuit Book calculou o valor teorico/interpolado automaticamente: } \\\\
      & \\theta = ${formatNum(measured, 1)}^\\circ \\\\
      & \\text{A margem de erro pratica e de } 0\\%\\text{ (ajuste perfeito ao modelo).}
    \\end{aligned}`;
    return katex.renderToString(latex, { throwOnError: false, displayMode: true });
  }

  const formula = isOp ? '\\text{Erro Absoluto } (\\theta_{\\text{erro}}) = |\\theta_{medido} - \\theta_{\\text{teor}}|' : '\\text{Erro (\\%)} = \\left| \\frac{\\theta_{medido} - \\theta_{\\text{teor}}}{\\theta_{\\text{teor}}} \\right| \\times 100';
  const substitution = isOp 
    ? `\\text{Erro Absoluto } = |${formatNum(measured, 2)}^\\circ - (${formatNum(theoretical, 2)}^\\circ)| = ${formatNum(error, 2)}^\\circ`
    : `\\text{Erro (\\%)} = \\left| \\frac{${formatNum(measured, 2)}^\\circ - (${formatNum(theoretical, 2)}^\\circ)}{${formatNum(theoretical, 2)}^\\circ} \\right| \\times 100 = ${formatNum(error, 2)}\\%`;

  const latex = `\\begin{aligned}
    \\textbf{Fase Teorica } (\\theta_{\\text{teor}}): \\quad & ${formatNum(theoretical, 2)}^\\circ \\\\
    \\textbf{Erro de Fase:} \\quad & ${formula} \\\\
    \\textbf{Calculo Pratico:} \\quad & ${substitution}
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
  
  const isPassive2ndOrder = order === 2 && !props.isOpamp;
  
  if (filterType === 'lowpass') {
    if (order === 1) {
      label = 'Filtro Passa-Baixas (LPF) de 1ª Ordem';
      formula = 'f_c = \\frac{1}{2\\pi R C} \\quad \\Rightarrow \\quad \\theta(f_c) = -45^\\circ';
      phaseCVal = '-45^\\circ';
    } else if (isPassive2ndOrder) {
      label = 'Filtro Passa-Baixas Passivo (LPF) de 2ª Ordem com Efeito de Carga';
      formula = 'f_{c,\\text{carga}} = \\frac{\\sqrt{y}}{2\\pi R C} \\approx 0,374 \\cdot f_{c,\\text{nom}} \\quad \\text{onde } y^2 + 7y - 1 = 0 \\Rightarrow y \\approx 0,140 \\quad \\Rightarrow \\quad \\theta(f_c) = -52,55^\\circ';
      phaseCVal = '-52,55^\\circ';
    } else {
      label = `Filtro Passa-Baixas (LPF) Ativo de ${order}ª Ordem`;
      formula = 'f_c = \\frac{1}{2\\pi \\sqrt{R_1 R_2 C_1 C_2}} \\quad \\Rightarrow \\quad \\theta(f_c) = -90^\\circ';
      phaseCVal = '-90^\\circ';
    }
  } else if (filterType === 'highpass') {
    if (order === 1) {
      label = 'Filtro Passa-Altas (HPF) de 1ª Ordem';
      formula = 'f_c = \\frac{1}{2\\pi R C} \\quad \\Rightarrow \\quad \\theta(f_c) = 45^\\circ';
      phaseCVal = '45^\\circ';
    } else if (isPassive2ndOrder) {
      label = 'Filtro Passa-Altas Passivo (HPF) de 2ª Ordem com Efeito de Carga';
      formula = 'f_{c,\\text{carga}} = \\frac{\\sqrt{y}}{2\\pi R C} \\approx 2,67 \\cdot f_{c,\\text{nom}} \\quad \\text{onde } y^2 - 7y - 1 = 0 \\Rightarrow y \\approx 7,140 \\quad \\Rightarrow \\quad \\theta(f_c) = 52,55^\\circ';
      phaseCVal = '52,55^\\circ';
    } else {
      label = `Filtro Passa-Altas (HPF) Ativo de ${order}ª Ordem`;
      formula = 'f_c = \\frac{1}{2\\pi \\sqrt{R_1 R_2 C_1 C_2}} \\quad \\Rightarrow \\quad \\theta(f_c) = 90^\\circ';
      phaseCVal = '90^\\circ';
    }
  } else {
    label = 'Filtro Seletivo Passa-Banda (BPF)';
    formula = 'f_0 = \\frac{1}{2\\pi \\sqrt{L C}} \\quad \\Rightarrow \\quad \\theta(f_0) = 0^\\circ';
    phaseCVal = '0^\\circ';
  }

  let fcText = props.fc >= 1000 ? `${(props.fc / 1000).toFixed(3)} kHz` : `${props.fc.toFixed(1)} Hz`;

  const maxGvLinear = Math.pow(10, props.maxGvDb / 20);
  const targetGv = maxGvLinear * 0.7071;
  const targetGvDb = props.maxGvDb - 3.0103;

  let latex = '';
  if (isPassive2ndOrder) {
    const quadraticEq = filterType === 'highpass' ? 'y^2 - 7y - 1 = 0' : 'y^2 + 7y - 1 = 0';
    const yVal = filterType === 'highpass' ? '7,140' : '0,140';
    const factorText = filterType === 'highpass' ? '2,67' : '0,374';
    const h2s = filterType === 'highpass' 
      ? 'H_2(s) = \\frac{s^2 R^2 C^2}{s^2 R^2 C^2 + 3sRC + 1}' 
      : 'H_2(s) = \\frac{1}{s^2 R^2 C^2 + 3sRC + 1}';

    latex = `\\begin{aligned}
      \\textbf{Filtro Diagnosticado:} \\quad & \\text{${label}} \\\\
      \\textbf{Modelo de Funcao Transferencia:} \\quad & ${h2s} \\\\
      \\textbf{Equacao Auxiliar } (y = (\\omega_c RC)^2): \\quad & ${quadraticEq} \\quad \\Rightarrow \\quad y \\approx ${yVal} \\\\
      \\textbf{Freq. Corte Experimental } (f_{c,\\text{exp}}): \\quad & \\mathbf{${fcText.replace('.', ',')}} \\\\
      \\textbf{Modelo Teorico com Carga } (f_{c,\\text{carga}}): \\quad & f_{c,\\text{carga}} = \\frac{\\sqrt{y}}{2\\pi R C} \\approx ${factorText} \\cdot f_{c,\\text{nom}} \\\\
      \\textbf{Fase Teorica em } f_c: \\quad & \\theta_{\\text{teor}}(f_c) = ${phaseCVal}
    \\end{aligned}`;
  } else {
    latex = `\\begin{aligned}
      \\textbf{Filtro Diagnosticado:} \\quad & \\text{${label}} \\\\
      \\textbf{Ganho Maximo do Circuito } (G_{max}): \\quad & ${formatNum(maxGvLinear, 4)} \\quad (${formatNum(props.maxGvDb, 2)}\\text{ dB}) \\\\
      \\textbf{Ganho de Corte Alvo } (0,707 \\cdot G_{max}): \\quad & ${formatNum(targetGv, 4)} \\quad (${formatNum(targetGvDb, 2)}\\text{ dB}) \\\\
      \\textbf{Frequencia de Corte Identificada } (f_c): \\quad & \\mathbf{${fcText.replace('.', ',')}} \\\\
      \\textbf{Equacao da Freq. Corte:} \\quad & ${formula} \\\\
      \\textbf{Fase Teorica em } f_c: \\quad & \\theta_{\\text{teor}}(f_c) = ${phaseCVal}
    \\end{aligned}`;
  }

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
      <h2>Equações e Fundamentação Científica (KaTeX)</h2>
    </div>
    <p class="cb-subtitle mb-5">
      Abaixo são expostas as equações que regem o comportamento físico deste circuito eletrônico, demonstrando as substituições passo a passo com base nos dados experimentais.
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
        <h3 class="cb-section-label mb-2">4. Margem de Erro de Fase (θ)</h3>
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
