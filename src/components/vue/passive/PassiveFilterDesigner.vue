<script setup lang="ts">
import { ref, computed } from 'vue';
import katex from 'katex';
import { parseEngineeringValue, formatEngineeringValue } from '../../../utils/engineeringFormat';
import OpampChartsPanel from '../opamp/OpampChartsPanel.vue';

// Topologias e Filtros
const topology = ref<'rc' | 'rl' | 'cascade' | 'rlc'>('rc');
const filterType = ref<'lowpass' | 'highpass' | 'bandpass'>('lowpass');

const svgViewBox = computed(() => {
  if (topology.value === 'rc' || topology.value === 'rl') return '0 110 290 150';
  if (topology.value === 'cascade') return '0 110 400 150';
  if (topology.value === 'rlc') return '0 110 430 150';
  return '0 110 520 150';
});

// Parâmetros de Projeto (Strings para inputs)
const targetFc = ref<string>('1k');
const inputR = ref<string>('1.5k');
const inputC = ref<string>('22n');
const inputL = ref<string>('1m');

// Resultados
const calculatorResult = ref<{ r: string, c: string, l: string, fc: number, error: number, q: number } | null>(null);

function calculateCommercialValues() {
  const target = parseEngineeringValue(targetFc.value);
  if (isNaN(target) || target <= 0) return;

  const e12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  const e24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  
  const caps: number[] = [];
  for(let mult = 1e-12; mult <= 1e-4; mult *= 10) {
    for(let val of e12) caps.push(val * mult);
  }

  const inds: number[] = [];
  for(let mult = 1e-6; mult <= 1e-1; mult *= 10) {
    for(let val of e12) inds.push(val * mult);
  }

  const res: number[] = [];
  for(let mult = 10; mult <= 1e6; mult *= 10) {
    for(let val of e24) res.push(val * mult);
  }

  let bestError = Infinity;
  let bestR = 1500;
  let bestC = 22e-9;
  let bestL = 1e-3;
  let bestFc = 0;
  let resultingQ = 0.5;

  if (topology.value === 'rc') {
    for (const c of caps) {
      const rIdeal = 1 / (2 * Math.PI * target * c);
      if (rIdeal < 10 || rIdeal > 1e6) continue;

      let closestR = res[0];
      let minRDiff = Math.abs(res[0] - rIdeal);
      for(let r of res) {
        const diff = Math.abs(r - rIdeal);
        if(diff < minRDiff) {
          minRDiff = diff;
          closestR = r;
        }
      }

      const actualFc = 1 / (2 * Math.PI * closestR * c);
      const error = Math.abs(actualFc - target) / target;
      if(error < bestError) {
        bestError = error;
        bestC = c;
        bestR = closestR;
        bestFc = actualFc;
      }
    }
  } else if (topology.value === 'rl') {
    for (const l of inds) {
      const rIdeal = 2 * Math.PI * target * l;
      if (rIdeal < 10 || rIdeal > 1e6) continue;

      let closestR = res[0];
      let minRDiff = Math.abs(res[0] - rIdeal);
      for(let r of res) {
        const diff = Math.abs(r - rIdeal);
        if(diff < minRDiff) {
          minRDiff = diff;
          closestR = r;
        }
      }

      const actualFc = closestR / (2 * Math.PI * l);
      const error = Math.abs(actualFc - target) / target;
      if(error < bestError) {
        bestError = error;
        bestL = l;
        bestR = closestR;
        bestFc = actualFc;
      }
    }
  } else if (topology.value === 'cascade') {
    for (const c of caps) {
      const kFactor = filterType.value === 'highpass' ? 2.6724 : 0.3742;
      const rIdeal = kFactor / (2 * Math.PI * target * c);
      if (rIdeal < 10 || rIdeal > 1e6) continue;

      let closestR = res[0];
      let minRDiff = Math.abs(res[0] - rIdeal);
      for(let r of res) {
        const diff = Math.abs(r - rIdeal);
        if(diff < minRDiff) {
          minRDiff = diff;
          closestR = r;
        }
      }

      const actualFc = kFactor / (2 * Math.PI * closestR * c);
      const error = Math.abs(actualFc - target) / target;
      if(error < bestError) {
        bestError = error;
        bestC = c;
        bestR = closestR;
        bestFc = actualFc;
      }
    }
  } else if (topology.value === 'rlc') {
    for (const c of caps) {
      const lIdeal = 1 / (Math.pow(2 * Math.PI * target, 2) * c);
      if (lIdeal < 1e-6 || lIdeal > 1) continue;

      let closestL = inds[0];
      let minLDiff = Math.abs(inds[0] - lIdeal);
      for(let l of inds) {
        const diff = Math.abs(l - lIdeal);
        if(diff < minLDiff) {
          minLDiff = diff;
          closestL = l;
        }
      }

      const actualFc = 1 / (2 * Math.PI * Math.sqrt(closestL * c));
      const error = Math.abs(actualFc - target) / target;
      
      if(error < bestError) {
        bestError = error;
        bestC = c;
        bestL = closestL;
        bestFc = actualFc;
        
        const rIdeal = (1 / 0.707) * Math.sqrt(closestL / c);
        
        let closestR = res[0];
        let minRDiff = Math.abs(res[0] - rIdeal);
        for(let r of res) {
          const diff = Math.abs(r - rIdeal);
          if(diff < minRDiff) {
            minRDiff = diff;
            closestR = r;
          }
        }
        bestR = closestR;
      }
    }
    resultingQ = (1 / bestR) * Math.sqrt(bestL / bestC);
  }

  const formatEng = (val: number, type: 'r'|'c'|'l') => {
    if (type === 'c') {
      if (val >= 1e-6) return (val * 1e6).toFixed(1).replace('.0','') + 'u';
      if (val >= 1e-9) return (val * 1e9).toFixed(1).replace('.0','') + 'n';
      return (val * 1e12).toFixed(1).replace('.0','') + 'p';
    } else if (type === 'l') {
      if (val >= 1) return val.toFixed(1).replace('.0','') + 'H';
      if (val >= 1e-3) return (val * 1e3).toFixed(1).replace('.0','') + 'm';
      return (val * 1e6).toFixed(1).replace('.0','') + 'u';
    } else {
      if (val >= 1e6) return (val / 1e6).toFixed(1).replace('.0','') + 'M';
      if (val >= 1e3) return (val / 1e3).toFixed(1).replace('.0','') + 'k';
      return val.toFixed(0);
    }
  };

  const rStr = formatEng(bestR, 'r');
  const cStr = formatEng(bestC, 'c');
  const lStr = formatEng(bestL, 'l');

  calculatorResult.value = {
    r: rStr,
    c: cStr,
    l: lStr,
    fc: bestFc,
    error: bestError * 100,
    q: resultingQ
  };

  inputR.value = rStr;
  if (topology.value !== 'rl') inputC.value = cStr;
  if (topology.value === 'rl' || topology.value === 'rlc') inputL.value = lStr;
}

// Design Data Computed
const designData = computed(() => {
  const rVal = parseEngineeringValue(inputR.value) || 1500;
  const cVal = parseEngineeringValue(inputC.value) || 22e-9;
  const lVal = parseEngineeringValue(inputL.value) || 1e-3;

  let fc = 0;
  let qFactor = 0.5;
  let rollOff = -20;

  if (topology.value === 'rc') {
    fc = 1 / (2 * Math.PI * rVal * cVal);
    rollOff = filterType.value === 'lowpass' ? -20 : 20;
  } else if (topology.value === 'rl') {
    fc = rVal / (2 * Math.PI * lVal);
    rollOff = filterType.value === 'lowpass' ? -20 : 20;
  } else if (topology.value === 'cascade') {
    const kFactor = filterType.value === 'highpass' ? 2.6724 : 0.3742;
    fc = kFactor / (2 * Math.PI * rVal * cVal);
    qFactor = 0.333;
    rollOff = filterType.value === 'lowpass' ? -40 : 40;
  } else if (topology.value === 'rlc') {
    fc = 1 / (2 * Math.PI * Math.sqrt(lVal * cVal));
    qFactor = (1 / rVal) * Math.sqrt(lVal / cVal);
    
    if (filterType.value === 'bandpass') {
      rollOff = 20;
    } else {
      rollOff = filterType.value === 'lowpass' ? -40 : 40;
    }
  }

  return { fc, qFactor, rollOff, rVal, cVal, lVal };
});

const formulaLatex = computed(() => {
  const R = designData.value.rVal;
  const C = designData.value.cVal;
  const L = designData.value.lVal;
  const fc = designData.value.fc;
  
  const formatNum = (num: number) => {
    if (num === 0) return '0';
    if (num >= 1000 || num < 0.01) {
      const parts = num.toExponential(2).split('e');
      return `${parts[0]} \\times 10^{${parseInt(parts[1])}}`;
    }
    return num.toFixed(2);
  };
  
  const fcStr = fc >= 1000 ? (fc/1000).toFixed(2) + ' \\text{ kHz}' : fc.toFixed(2) + ' \\text{ Hz}';
  
  let equation = '';
  if (topology.value === 'rc') {
    equation = `\\begin{aligned}
f_c &= \\frac{1}{2\\pi R C} \\\\
f_c &= \\frac{1}{2\\pi \\cdot (${formatNum(R)}) \\cdot (${formatNum(C)})} \\\\
f_c &= ${fcStr}
\\end{aligned}`;
  } else if (topology.value === 'rl') {
    equation = `\\begin{aligned}
f_c &= \\frac{R}{2\\pi L} \\\\
f_c &= \\frac{${formatNum(R)}}{2\\pi \\cdot (${formatNum(L)})} \\\\
f_c &= ${fcStr}
\\end{aligned}`;
  } else if (topology.value === 'cascade') {
    const isHP = filterType.value === 'highpass';
    const h_s = isHP 
      ? `H(s) &= \\frac{(sRC)^2}{(sRC)^2 + 3sRC + 1} \\\\`
      : `H(s) &= \\frac{1}{(sRC)^2 + 3sRC + 1} \\\\`;
    const root_expr = isHP 
      ? `\\sqrt{\\frac{7+\\sqrt{53}}{2}}` 
      : `\\sqrt{\\frac{\\sqrt{53}-7}{2}}`;
    const kFactor = isHP ? 2.6724 : 0.3742;
    
    equation = `\\begin{aligned}
${h_s}
f_{c\\text{, cascata}} &= \\frac{1}{2\\pi R C} ${root_expr} \\\\
f_{c\\text{, cascata}} &\\approx \\frac{1}{2\\pi \\cdot (${formatNum(R)}) \\cdot (${formatNum(C)})} \\cdot ${kFactor} \\\\
f_{c\\text{, cascata}} &\\approx ${fcStr}
\\end{aligned}`;
  } else if (topology.value === 'rlc') {
    const Q = designData.value.qFactor;
    const BW = fc / Q;
    const BWStr = BW >= 1000 ? (BW/1000).toFixed(2) + ' \\text{ kHz}' : BW.toFixed(2) + ' \\text{ Hz}';
    
    equation = `\\begin{aligned}
f_0 &= \\frac{1}{2\\pi \\sqrt{L C}} \\\\
f_0 &= \\frac{1}{2\\pi \\sqrt{(${formatNum(L)}) \\cdot (${formatNum(C)})}} = ${fcStr} \\\\
\\\\
Q &= \\frac{1}{R}\\sqrt{\\frac{L}{C}} \\\\
Q &= \\frac{1}{${formatNum(R)}}\\sqrt{\\frac{${formatNum(L)}}{${formatNum(C)}}} = ${Q.toFixed(3)} \\\\
\\\\
BW &= \\frac{f_0}{Q} = ${BWStr}
\\end{aligned}`;
  }
  return katex.renderToString(equation, { throwOnError: false, displayMode: true });
});

// --- Theoretical Simulation for Charts ---
const simulatedPoints = computed(() => {
  const data = designData.value;
  const points = [];
  const logStart = Math.log10(10);
  const logEnd = Math.log10(10000000);
  const steps = 200;
  
  for (let i = 0; i <= steps; i++) {
    const logF = logStart + (i / steps) * (logEnd - logStart);
    const f = Math.pow(10, logF);
    
    let gLinear = 1;
    let phase = 0;
    
    if (topology.value === 'rc' || topology.value === 'rl') {
      const fRatio = f / data.fc;
      if (filterType.value === 'lowpass') {
        gLinear = 1 / Math.sqrt(1 + fRatio * fRatio);
        phase = -Math.atan(fRatio) * (180 / Math.PI);
      } else {
        gLinear = fRatio / Math.sqrt(1 + fRatio * fRatio);
        phase = Math.atan(1 / fRatio) * (180 / Math.PI);
      }
    } else if (topology.value === 'cascade') {
      let f0_local = data.fc / 0.3742;
      if (filterType.value === 'highpass') f0_local = data.fc * 0.3742;
      
      const ratio = f / f0_local;
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(3 * ratio, 2));
      
      if (filterType.value === 'lowpass') {
        gLinear = 1 / denom;
        phase = -Math.atan2(3 * ratio, 1 - ratio * ratio) * (180 / Math.PI);
      } else {
        gLinear = (ratio * ratio) / denom;
        phase = (Math.PI - Math.atan2(3 * ratio, 1 - ratio * ratio)) * (180 / Math.PI);
      }
    } else if (topology.value === 'rlc') {
      const f0 = data.fc; // for RLC fc is f0
      const ratio = f / f0;
      const Q = data.qFactor;
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(ratio / Q, 2));
      
      if (filterType.value === 'lowpass') {
        gLinear = 1 / denom;
        phase = -Math.atan2(ratio / Q, 1 - ratio * ratio) * (180 / Math.PI);
      } else if (filterType.value === 'highpass') {
        gLinear = (ratio * ratio) / denom;
        phase = (Math.PI - Math.atan2(ratio / Q, 1 - ratio * ratio)) * (180 / Math.PI);
      } else if (filterType.value === 'bandpass') {
        gLinear = (ratio / Q) / denom;
        phase = (Math.PI / 2 - Math.atan2(ratio / Q, 1 - ratio * ratio)) * (180 / Math.PI);
      }
    }
    
    while (phase > 180) phase -= 360;
    while (phase <= -180) phase += 360;
    
    const gDb = gLinear > 0 ? 20 * Math.log10(gLinear) : -100;
    
    points.push({
      freq: f,
      gLinear,
      gDb: parseFloat(gDb.toFixed(3)),
      phase: parseFloat(phase.toFixed(2))
    });
  }
  return points;
});

const simulatedBodeData = computed(() => {
  return simulatedPoints.value.map(p => ({
    id: 'sim-' + p.freq,
    freq: p.freq,
    vMax: null,
    vMin: null,
    phase: p.phase,
    gvLinear: p.gLinear,
    gvDb: p.gDb
  }));
});
</script>

<template>
  <div class="flex flex-col gap-6 w-full">
    <!-- All UI Cards Stacked Vertically -->
    
    <div class="flex flex-col gap-5">

      <div class="cb-card p-5">
        <div class="cb-card-header">
          <span class="accent-dot"></span>
          <h2>Parâmetros do Filtro Passivo</h2>
        </div>

        <!-- Target Frequency Calculator -->
        <div class="cb-calc-surface text-xs">
          <span class="cb-section-label flex items-center gap-1 mb-2" style="color:var(--primary-text)">
            <span class="material-symbols-outlined text-[15px]">calculate</span>
            Calculadora de Componentes Comerciais
          </span>
          <p class="cb-subtitle mb-3">
            Digite a frequência alvo e o sistema calculará os valores comerciais ideais de Resistores (E24), Capacitores e Indutores (E12).
          </p>
          <div class="flex gap-2 items-end">
            <div class="flex-1 space-y-1">
              <label class="cb-label">Frequência Alvo (Hz)</label>
              <input 
                type="text" 
                v-model="targetFc" 
                class="cb-input" 
                placeholder="ex: 1k"
              />
            </div>
            <button 
              @click="calculateCommercialValues"
              type="button"
              class="cb-btn h-[38px]">
              Calcular R, L, C
            </button>
          </div>

          <div v-if="calculatorResult" class="cb-calc-result mt-4">
            <div class="grid grid-cols-2 gap-2 text-[10px]">
              <div><span style="color:var(--text-tertiary)">Resistor Base:</span> <strong class="cb-summary-value">{{ calculatorResult.r }}Ω</strong></div>
              <div v-if="topology !== 'rl'"><span style="color:var(--text-tertiary)">Capacitor Base:</span> <strong class="cb-summary-value">{{ calculatorResult.c }}F</strong></div>
              <div v-if="topology === 'rl' || topology === 'rlc'"><span style="color:var(--text-tertiary)">Indutor Base:</span> <strong class="cb-summary-value">{{ calculatorResult.l }}H</strong></div>
              <div><span style="color:var(--text-tertiary)">fc Real:</span> <strong>{{ calculatorResult.fc >= 1000 ? (calculatorResult.fc/1000).toFixed(2) + ' kHz' : calculatorResult.fc.toFixed(1) + ' Hz' }}</strong></div>
              <div class="col-span-2"><span style="color:var(--text-tertiary)">Erro:</span> <strong :style="calculatorResult.error < 5 ? 'color:var(--success-text)' : 'color:var(--error-text)'">{{ calculatorResult.error.toFixed(2) }}%</strong></div>
            </div>
          </div>
        </div>
        
        <div class="space-y-4 text-xs mt-5">
          <!-- Topology -->
          <div class="space-y-1">
            <span class="cb-section-label">Topologia do Filtro Passivo</span>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
              <button @click="topology = 'rc'; filterType = 'lowpass'" :class="['cb-chip', topology === 'rc' ? 'cb-chip-active' : '']">RC (1ª Ordem)</button>
              <button @click="topology = 'rl'; filterType = 'lowpass'" :class="['cb-chip', topology === 'rl' ? 'cb-chip-active' : '']">RL (1ª Ordem)</button>
              <button @click="topology = 'cascade'; filterType = 'lowpass'" :class="['cb-chip', topology === 'cascade' ? 'cb-chip-active' : '']">Cascata RC (2ª)</button>
              <button @click="topology = 'rlc'; filterType = 'lowpass'" :class="['cb-chip', topology === 'rlc' ? 'cb-chip-active' : '']">RLC (2ª Ordem)</button>
            </div>
          </div>

          <!-- Type -->
          <div class="space-y-1">
            <span class="cb-section-label">Tipo de Filtro</span>
            <div class="grid grid-cols-2 gap-2 mt-1" :class="topology === 'rlc' ? 'sm:grid-cols-3' : ''">
              <button @click="filterType = 'lowpass'" :class="['cb-chip', filterType === 'lowpass' ? 'cb-chip-active' : '']">Passa-Baixas</button>
              <button @click="filterType = 'highpass'" :class="['cb-chip', filterType === 'highpass' ? 'cb-chip-active' : '']">Passa-Altas</button>
              <button v-if="topology === 'rlc'" @click="filterType = 'bandpass'" :class="['cb-chip', filterType === 'bandpass' ? 'cb-chip-active' : '']">Passa-Banda</button>
            </div>
          </div>

          <hr class="cb-divider" />

          <!-- Component Values -->
          <div class="grid grid-cols-3 gap-3">
            <div class="space-y-1">
              <label class="cb-label">Resistor (R)</label>
              <input type="text" v-model="inputR" class="cb-input" placeholder="ex: 1.5k" />
            </div>
            <div class="space-y-1">
              <label class="cb-label">Capacitor (C)</label>
              <input type="text" v-model="inputC" class="cb-input" placeholder="ex: 22n" :disabled="topology === 'rl'" :style="topology === 'rl' ? 'opacity:0.5' : ''" />
            </div>
            <div class="space-y-1">
              <label class="cb-label">Indutor (L)</label>
              <input type="text" v-model="inputL" class="cb-input" placeholder="ex: 1m" :disabled="topology === 'rc' || topology === 'cascade'" :style="topology === 'rc' || topology === 'cascade' ? 'opacity:0.5' : ''" />
            </div>
          </div>

          <!-- Summaries -->
          <div class="mt-4">
            <div class="cb-summary">
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Freq. de Corte Real</span>
                <span class="cb-summary-value">{{ designData.fc >= 1000 ? (designData.fc/1000).toFixed(2) + ' kHz' : designData.fc.toFixed(1) + ' Hz' }}</span>
              </div>
              <div class="flex flex-col gap-0.5" v-if="topology === 'rlc' || topology === 'cascade'">
                <span class="cb-summary-label">Fator de Qualidade (Q)</span>
                <span class="cb-summary-value">{{ designData.qFactor.toFixed(3) }}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Estabilidade</span>
                <span class="cb-status cb-status-ok"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span> Passivo (Estável)</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Roll-off Téorico</span>
                <span class="cb-summary-value">{{ designData.rollOff > 0 ? '+' + designData.rollOff : designData.rollOff }} dB/década</span>
              </div>
            </div>
            <div v-if="topology === 'cascade'" class="mt-3 cb-alert-info">
              <span class="material-symbols-outlined text-[16px] mt-0.5">info</span>
              <div>
                <strong>Loading Effect (Efeito de Carga):</strong> Filtros RC em cascata sofrem perdas pois o segundo estágio carrega o primeiro. A frequência de corte real da cascata é ~ 0.374 fc do estágio unitário. Os cálculos já compensam essa perda!
              </div>
            </div>
          </div>
          
        </div>
      </div>
      
      <!-- KaTeX mathematical details -->
      <div class="cb-card p-5">
        <div class="cb-card-header">
          <span class="accent-dot"></span>
          <h2>Equações de Projeto e Passo a Passo (KaTeX)</h2>
        </div>
        <p class="cb-subtitle mb-4">
          Com base nos parâmetros desejados, a reorganização de fórmulas determina a frequência. Veja a substituição algébrica correspondente:
        </p>
        
        <div class="cb-inset p-6 flex flex-col justify-center min-h-[140px] text-base font-mono overflow-x-auto" style="color:var(--text-primary)">
          <div v-html="formulaLatex" class="math-container"></div>
        </div>
      </div>

      <!-- Interactive Dynamic SVG Circuit Diagram -->
      <div class="cb-card p-5 flex-1 flex flex-col">
        <div class="cb-card-header">
          <span class="accent-dot"></span>
          <h2>Esquema Dinâmico do Circuito</h2>
        </div>
        <p class="cb-subtitle mb-4">
          Diagrama esquemático ativo atualizado em tempo real com os componentes calculados para montagem física em bancada ou simulação LTSpice.
        </p>
        
        <div class="cb-inset flex-1 min-h-[260px] p-2 flex items-center justify-center relative overflow-hidden select-none">
          <svg :viewBox="svgViewBox" class="w-full max-w-[450px] max-h-[250px] stroke-slate-800 dark:stroke-slate-300 fill-none font-mono text-[10px] transition-all duration-300">
            <!-- VIN Input -->
            <line x1="20" y1="165" x2="40" y2="165" stroke-width="2" />
            <circle cx="20" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="8" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VIN</text>

            <g v-if="topology === 'rc' && filterType === 'lowpass'">
              <!-- RC Lowpass: R series, C shunt -->
              <!-- R -->
              <path d="M 40 165 L 50 165 L 55 157 L 63 173 L 71 157 L 79 173 L 87 157 L 95 173 L 100 165 L 130 165" stroke-width="2" />
              <text x="85" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- Junction -->
              <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- C to Ground -->
              <line x1="130" y1="165" x2="130" y2="198" stroke-width="2" />
              <line x1="118" y1="198" x2="142" y2="198" stroke-width="2.5" />
              <line x1="118" y1="202" x2="142" y2="202" stroke-width="2.5" />
              <line x1="130" y1="202" x2="130" y2="222" stroke-width="2" />
              <!-- Ground -->
              <line x1="118" y1="222" x2="142" y2="222" stroke-width="2" />
              <line x1="123" y1="226" x2="137" y2="226" stroke-width="1.5" />
              <line x1="128" y1="230" x2="132" y2="230" stroke-width="1" />
              <text x="145" y="205" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <!-- VOUT -->
              <line x1="130" y1="165" x2="240" y2="165" stroke-width="2" />
              <circle cx="240" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="248" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rc' && filterType === 'highpass'">
              <!-- RC Highpass: C series, R shunt -->
              <!-- C -->
              <line x1="40" y1="165" x2="70" y2="165" stroke-width="2" />
              <line x1="70" y1="150" x2="70" y2="180" stroke-width="2.5" />
              <line x1="74" y1="150" x2="74" y2="180" stroke-width="2.5" />
              <line x1="74" y1="165" x2="130" y2="165" stroke-width="2" />
              <text x="72" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <!-- Junction -->
              <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- R to Ground -->
              <path d="M 130 165 L 130 175 L 122 180 L 138 188 L 122 196 L 138 204 L 122 212 L 138 220 L 130 225 L 130 235" stroke-width="2" />
              <text x="145" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- Ground -->
              <line x1="118" y1="235" x2="142" y2="235" stroke-width="2" />
              <line x1="123" y1="239" x2="137" y2="239" stroke-width="1.5" />
              <line x1="128" y1="243" x2="132" y2="243" stroke-width="1" />
              <!-- VOUT -->
              <line x1="130" y1="165" x2="240" y2="165" stroke-width="2" />
              <circle cx="240" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="248" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rl' && filterType === 'lowpass'">
              <!-- RL Lowpass: L series, R shunt -->
              <!-- L -->
              <path d="M 40 165 L 50 165 C 50 150, 65 150, 65 165 C 65 150, 80 150, 80 165 C 80 150, 95 150, 95 165 C 95 150, 110 150, 110 165 L 130 165" stroke-width="2" />
              <text x="85" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">L = {{ formatEngineeringValue(designData.lVal, 'H') }}</text>
              <!-- Junction -->
              <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- R to Ground -->
              <path d="M 130 165 L 130 175 L 122 180 L 138 188 L 122 196 L 138 204 L 122 212 L 138 220 L 130 225 L 130 235" stroke-width="2" />
              <text x="145" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- Ground -->
              <line x1="118" y1="235" x2="142" y2="235" stroke-width="2" />
              <line x1="123" y1="239" x2="137" y2="239" stroke-width="1.5" />
              <line x1="128" y1="243" x2="132" y2="243" stroke-width="1" />
              <!-- VOUT -->
              <line x1="130" y1="165" x2="240" y2="165" stroke-width="2" />
              <circle cx="240" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="248" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rl' && filterType === 'highpass'">
              <!-- RL Highpass: R series, L shunt -->
              <!-- R -->
              <path d="M 40 165 L 50 165 L 55 157 L 63 173 L 71 157 L 79 173 L 87 157 L 95 173 L 100 165 L 130 165" stroke-width="2" />
              <text x="85" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- Junction -->
              <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- L to Ground -->
              <path d="M 130 165 L 130 175 C 115 175, 115 190, 130 190 C 115 190, 115 205, 130 205 C 115 205, 115 220, 130 220 L 130 235" stroke-width="2" />
              <text x="148" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">L = {{ formatEngineeringValue(designData.lVal, 'H') }}</text>
              <!-- Ground -->
              <line x1="118" y1="235" x2="142" y2="235" stroke-width="2" />
              <line x1="123" y1="239" x2="137" y2="239" stroke-width="1.5" />
              <line x1="128" y1="243" x2="132" y2="243" stroke-width="1" />
              <!-- VOUT -->
              <line x1="130" y1="165" x2="240" y2="165" stroke-width="2" />
              <circle cx="240" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="248" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'cascade' && filterType === 'lowpass'">
              <!-- Cascade LP: R1 -> C1(gnd) -> R2 -> C2(gnd) -->
              <!-- R1 -->
              <path d="M 40 165 L 50 165 L 55 157 L 63 173 L 71 157 L 79 173 L 87 157 L 95 173 L 100 165 L 140 165" stroke-width="2" />
              <text x="90" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <circle cx="140" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- C1 to Ground -->
              <line x1="140" y1="165" x2="140" y2="198" stroke-width="2" />
              <line x1="128" y1="198" x2="152" y2="198" stroke-width="2.5" />
              <line x1="128" y1="202" x2="152" y2="202" stroke-width="2.5" />
              <line x1="140" y1="202" x2="140" y2="222" stroke-width="2" />
              <line x1="128" y1="222" x2="152" y2="222" stroke-width="2" />
              <text x="155" y="205" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>

              <!-- R2 -->
              <path d="M 140 165 L 170 165 L 175 157 L 183 173 L 191 157 L 199 173 L 207 157 L 215 173 L 220 165 L 260 165" stroke-width="2" />
              <text x="200" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <circle cx="260" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- C2 to Ground -->
              <line x1="260" y1="165" x2="260" y2="198" stroke-width="2" />
              <line x1="248" y1="198" x2="272" y2="198" stroke-width="2.5" />
              <line x1="248" y1="202" x2="272" y2="202" stroke-width="2.5" />
              <line x1="260" y1="202" x2="260" y2="222" stroke-width="2" />
              <line x1="248" y1="222" x2="272" y2="222" stroke-width="2" />
              <text x="275" y="205" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>

              <!-- VOUT -->
              <line x1="260" y1="165" x2="350" y2="165" stroke-width="2" />
              <circle cx="350" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="358" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'cascade' && filterType === 'highpass'">
              <!-- Cascade HP: C1 -> R1(gnd) -> C2 -> R2(gnd) -->
              <!-- C1 -->
              <line x1="40" y1="165" x2="80" y2="165" stroke-width="2" />
              <line x1="80" y1="150" x2="80" y2="180" stroke-width="2.5" />
              <line x1="84" y1="150" x2="84" y2="180" stroke-width="2.5" />
              <line x1="84" y1="165" x2="140" y2="165" stroke-width="2" />
              <text x="82" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <circle cx="140" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- R1 to Ground -->
              <path d="M 140 165 L 140 175 L 132 180 L 148 188 L 132 196 L 148 204 L 132 212 L 148 220 L 140 225 L 140 235" stroke-width="2" />
              <text x="155" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <line x1="128" y1="235" x2="152" y2="235" stroke-width="2" />
              <line x1="133" y1="239" x2="147" y2="239" stroke-width="1.5" />
              <line x1="138" y1="243" x2="142" y2="243" stroke-width="1" />

              <!-- C2 -->
              <line x1="140" y1="165" x2="190" y2="165" stroke-width="2" />
              <line x1="190" y1="150" x2="190" y2="180" stroke-width="2.5" />
              <line x1="194" y1="150" x2="194" y2="180" stroke-width="2.5" />
              <line x1="194" y1="165" x2="260" y2="165" stroke-width="2" />
              <text x="192" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <circle cx="260" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <!-- R2 to Ground -->
              <path d="M 260 165 L 260 175 L 252 180 L 268 188 L 252 196 L 268 204 L 252 212 L 268 220 L 260 225 L 260 235" stroke-width="2" />
              <text x="275" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <line x1="248" y1="235" x2="272" y2="235" stroke-width="2" />
              <line x1="253" y1="239" x2="267" y2="239" stroke-width="1.5" />
              <line x1="258" y1="243" x2="262" y2="243" stroke-width="1" />

              <!-- VOUT -->
              <line x1="260" y1="165" x2="350" y2="165" stroke-width="2" />
              <circle cx="350" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="358" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rlc' && filterType === 'lowpass'">
              <!-- RLC LP: L -> R -> C(gnd) -->
              <!-- L -->
              <path d="M 40 165 L 70 165 C 70 150, 85 150, 85 165 C 85 150, 100 150, 100 165 C 100 150, 115 150, 115 165 L 170 165" stroke-width="2" />
              <text x="105" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">L = {{ formatEngineeringValue(designData.lVal, 'H') }}</text>
              <!-- R -->
              <path d="M 170 165 L 210 165 L 215 157 L 223 173 L 231 157 L 239 173 L 247 157 L 255 173 L 260 165 L 300 165" stroke-width="2" />
              <text x="235" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- C to Ground -->
              <circle cx="300" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <line x1="300" y1="165" x2="300" y2="198" stroke-width="2" />
              <line x1="288" y1="198" x2="312" y2="198" stroke-width="2.5" />
              <line x1="288" y1="202" x2="312" y2="202" stroke-width="2.5" />
              <line x1="300" y1="202" x2="300" y2="222" stroke-width="2" />
              <text x="315" y="205" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <line x1="288" y1="222" x2="312" y2="222" stroke-width="2" />
              <line x1="293" y1="226" x2="307" y2="226" stroke-width="1.5" />
              <line x1="298" y1="230" x2="302" y2="230" stroke-width="1" />
              <!-- VOUT -->
              <line x1="300" y1="165" x2="380" y2="165" stroke-width="2" />
              <circle cx="380" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="388" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rlc' && filterType === 'highpass'">
              <!-- RLC HP: C -> R -> L(gnd) -->
              <!-- C -->
              <line x1="40" y1="165" x2="103" y2="165" stroke-width="2" />
              <line x1="103" y1="150" x2="103" y2="180" stroke-width="2.5" />
              <line x1="107" y1="150" x2="107" y2="180" stroke-width="2.5" />
              <line x1="107" y1="165" x2="170" y2="165" stroke-width="2" />
              <text x="105" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <!-- R -->
              <path d="M 170 165 L 210 165 L 215 157 L 223 173 L 231 157 L 239 173 L 247 157 L 255 173 L 260 165 L 300 165" stroke-width="2" />
              <text x="235" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <!-- L to Ground -->
              <circle cx="300" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <path d="M 300 165 L 300 175 C 285 175, 285 190, 300 190 C 285 190, 285 205, 300 205 C 285 205, 285 220, 300 220 L 300 235" stroke-width="2" />
              <text x="315" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">L = {{ formatEngineeringValue(designData.lVal, 'H') }}</text>
              <line x1="288" y1="235" x2="312" y2="235" stroke-width="2" />
              <line x1="293" y1="239" x2="307" y2="239" stroke-width="1.5" />
              <line x1="298" y1="243" x2="302" y2="243" stroke-width="1" />
              <!-- VOUT -->
              <line x1="300" y1="165" x2="380" y2="165" stroke-width="2" />
              <circle cx="380" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="388" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

            <g v-if="topology === 'rlc' && filterType === 'bandpass'">
              <!-- RLC BP: L -> C -> R(gnd) -->
              <!-- L -->
              <path d="M 40 165 L 70 165 C 70 150, 85 150, 85 165 C 85 150, 100 150, 100 165 C 100 150, 115 150, 115 165 L 170 165" stroke-width="2" />
              <text x="105" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">L = {{ formatEngineeringValue(designData.lVal, 'H') }}</text>
              <!-- C -->
              <line x1="170" y1="165" x2="233" y2="165" stroke-width="2" />
              <line x1="233" y1="150" x2="233" y2="180" stroke-width="2.5" />
              <line x1="237" y1="150" x2="237" y2="180" stroke-width="2.5" />
              <line x1="237" y1="165" x2="300" y2="165" stroke-width="2" />
              <text x="235" y="140" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">C = {{ formatEngineeringValue(designData.cVal, 'F') }}</text>
              <!-- R to Ground -->
              <circle cx="300" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />
              <path d="M 300 165 L 300 175 L 292 180 L 308 188 L 292 196 L 308 204 L 292 212 L 308 220 L 300 225 L 300 235" stroke-width="2" />
              <text x="315" y="200" text-anchor="start" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold text-[12px]">R = {{ formatEngineeringValue(designData.rVal, 'Ω') }}</text>
              <line x1="288" y1="235" x2="312" y2="235" stroke-width="2" />
              <line x1="293" y1="239" x2="307" y2="239" stroke-width="1.5" />
              <line x1="298" y1="243" x2="302" y2="243" stroke-width="1" />
              <!-- VOUT -->
              <line x1="300" y1="165" x2="380" y2="165" stroke-width="2" />
              <circle cx="380" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
              <text x="388" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
            </g>

          </svg>
        </div>
      </div>
    </div>

    <!-- 2. Experimental Bench Simulation Module -->
    <div class="cb-card p-5" id="bancada">
      <div class="cb-card-header">
        <span class="accent-dot" style="background:var(--success-color)"></span>
        <h2>Bancada de Ensaios Virtuais (Bode Plot)</h2>
      </div>
      <p class="cb-subtitle mb-4">
        Os gráficos abaixo representam a resposta em frequência teórica do filtro passivo projetado.
      </p>
      
      <div class="w-full flex-1 flex flex-col p-0 overflow-hidden" style="border:1px solid var(--border-default); border-radius:8px">
        <OpampChartsPanel 
          :processed-data="(simulatedBodeData as any)" 
          :cutoff-frequency="designData.fc"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.math-container :deep(.katex-display) {
  margin: 0.5em 0 !important;
}
.math-container :deep(.katex) {
  font-size: 0.9em !important;
}
</style>
