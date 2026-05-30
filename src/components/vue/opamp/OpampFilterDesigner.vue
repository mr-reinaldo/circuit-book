<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import katex from 'katex';
import { parseEngineeringValue, formatEngineeringValue } from '../../../utils/mathUtilsOpamp';
import OpampChartsPanel from './OpampChartsPanel.vue';

const emit = defineEmits<{
  (e: 'exportSimulatedData', points: Array<{ freq: number; vMax: number; vMin: number; phase: number | null }>): void;
}>();

// User inputs
const filterType = ref<'lowpass' | 'highpass'>('lowpass');
const filterOrder = ref<1 | 2>(2);
const topology = ref<'passive_cascade'>('passive_cascade'); // Fixed for 2nd order
const voltageFollower = ref<boolean>(false); // Defaults to false for the project

// Design input parameters (stored as strings to allow engineering suffixes like 10n, 1.5k, etc.)
const inputR = ref<string>('1.5k');
const inputC = ref<string>('22n');
const inputR3 = ref<string>('10k'); // Feedback Resistor (Rf)
const inputR4 = ref<string>('1k'); // Ground Resistor (Rg)
const inputVp = ref<string>('12'); // Positive Power Supply (Vcc)
const inputVn = ref<string>('-12'); // Negative Power Supply (Vee)

// Target frequency calculator
const targetFc = ref<string>('5k');
const calculatorResult = ref<{ r: string, c: string, fc1: number, fc2: number, error: number } | null>(null);

// State for simulation plot interaction
const hoveredFreq = ref<number | null>(null);

// Watch follower toggle to adjust default gains
watch(voltageFollower, (newVal) => {
  if (newVal) {
    inputR3.value = '0';
    inputR4.value = '1M'; // dummy high
  } else {
    inputR3.value = '10k';
    inputR4.value = '1k';
  }
});

function calculateCommercialValues() {
  const target = parseEngineeringValue(targetFc.value);
  if (isNaN(target) || target <= 0) return;

  const e12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  const e24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];
  
  const caps: number[] = [];
  for(let mult = 1e-12; mult <= 1e-4; mult *= 10) {
    for(let val of e12) caps.push(val * mult);
  }

  const res: number[] = [];
  for(let mult = 10; mult <= 1e6; mult *= 10) {
    for(let val of e24) res.push(val * mult);
  }

  let bestError = Infinity;
  let bestC = 22e-9;
  let bestR = 1500;
  let bestFc1 = 0;

  for (const c of caps) {
    const rIdeal = 1 / (2 * Math.PI * target * c);
    
    // Limits
    if (rIdeal < 100 || rIdeal > 1e6) continue;

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
      bestFc1 = actualFc;
    }
  }

  const formatEng = (val: number, isCap: boolean) => {
    if (isCap) {
      if (val >= 1e-6) return (val * 1e6).toFixed(1).replace('.0','') + 'u';
      if (val >= 1e-9) return (val * 1e9).toFixed(1).replace('.0','') + 'n';
      return (val * 1e12).toFixed(1).replace('.0','') + 'p';
    } else {
      if (val >= 1e6) return (val / 1e6).toFixed(1).replace('.0','') + 'M';
      if (val >= 1e3) return (val / 1e3).toFixed(1).replace('.0','') + 'k';
      return val.toFixed(0);
    }
  };

  const rStr = formatEng(bestR, false);
  const cStr = formatEng(bestC, true);

  calculatorResult.value = {
    r: rStr,
    c: cStr,
    fc1: bestFc1,
    fc2: bestFc1 * 0.3742, // factor for cascade
    error: bestError * 100
  };

  inputR.value = rStr;
  inputC.value = cStr;
}

// Parse helper
function safeParse(val: string, fallback: number): number {
  const num = parseEngineeringValue(val);
  return isNaN(num) || num <= 0 ? fallback : num;
}

// Design Calculations
const designData = computed(() => {
  const rBase = safeParse(inputR.value, 1500);
  const cBase = safeParse(inputC.value, 22e-9); 
  const isFollower = voltageFollower.value;
  
  let r3 = 0;
  let r4 = Infinity;
  let gain = 1;
  
  if (!isFollower) {
    r3 = parseEngineeringValue(inputR3.value);
    r4 = parseEngineeringValue(inputR4.value);
    if (isNaN(r3) || r3 < 0) r3 = 10000;
    if (isNaN(r4) || r4 <= 0) r4 = 10000;
    gain = 1 + r3 / r4;
  }
  
  let vp = parseEngineeringValue(inputVp.value);
  if (isNaN(vp)) vp = 12;
  let vn = parseEngineeringValue(inputVn.value);
  if (isNaN(vn)) vn = -12;
  
  let fc = 1 / (2 * Math.PI * rBase * cBase);
  let fc2 = fc; // For cascade

  let r1 = rBase;
  let r2 = rBase;
  let c1 = cBase;
  let c2 = cBase;
  let r_mfb = rBase; 
  let qFactor = 0.5;
  let isStable = true;
  let rollOff = -20;
  
  // 1. 1ª Ordem
  if (filterOrder.value === 1) {
    rollOff = filterType.value === 'highpass' ? 20 : -20;
    qFactor = 0.5; // Single pole
  }
  // 2. 2ª Ordem Cascata Passiva RC
  else if (filterOrder.value === 2) {
    rollOff = filterType.value === 'highpass' ? 40 : -40;
    fc2 = 0.3742 * fc; 
    // If highpass cascade, factor is 1/0.3742 = 2.67. 
    if (filterType.value === 'highpass') {
      fc2 = fc / 0.3742; 
    }
    fc = fc2; // Real cutoff frequency of the whole system
    qFactor = 0.333; // Filtro superamortecido de pólos reais cascata
  }

  return {
    fc,         // Real Cutoff
    fc1: 1 / (2 * Math.PI * rBase * cBase), // Ideal single-stage cutoff
    cBase,
    rBase,
    r1,
    r2,
    c1,
    c2,
    r3,
    r4,
    r_mfb,
    gain,
    qFactor,
    isStable,
    rollOff,
    vp,
    vn
  };
});

// KaTeX LaTeX explanations
const katexFormulaHtml = computed(() => {
  const data = designData.value;
  let latex = '';
  
  if (filterOrder.value === 1) {
    if (filterType.value === 'lowpass') {
      latex = `\\begin{aligned}
        &\\textbf{Filtro Passa-Baixas de 1a Ordem} \\\\[1.5ex]
        &\\textbf{Função de Transferência:} \\quad H(s) = \\frac{A_v}{1 + s R_1 C_1} \\\\[1.5ex]
        &\\textbf{Valores Comerciais:} \\quad R_1 = \\mathbf{${formatEngineeringValue(data.r1, '\\Omega')}}, \\ C_1 = \\mathbf{${formatEngineeringValue(data.c1, 'F')}} \\\\[1.5ex]
        &\\textbf{Cálculo de } f_c: \\quad f_c = \\frac{1}{2\\pi R_1 C_1} = \\mathbf{${data.fc.toFixed(1)}\\text{ Hz}} \\\\[1.5ex]
        &\\textbf{Polo do Sistema:} \\quad p_1 = -\\frac{1}{R_1 C_1} = \\mathbf{${(-1/(data.r1*data.c1)).toFixed(1)}\\text{ rad/s}} \\\\[1.5ex]
        &\\textbf{Ganho Linear } (A_v): \\quad A_v = 1 + \\frac{R_3}{R_4} = \\mathbf{${data.gain.toFixed(3)}} \\\\[1.5ex]
        &\\textbf{Ganho } (\\text{dB}): \\quad A_{dB} = 20 \\log_{10}(A_v) = \\mathbf{${(20 * Math.log10(data.gain)).toFixed(2)} \\text{ dB}} \\\\[1.5ex]
        &\\textbf{Fase } \\phi(f): \\quad -\\arctan\\left(\\frac{f}{f_c}\\right) \\\\[1.5ex]
        &\\textbf{Resposta ao Degrau:} \\quad V_{out}(t) = V_{in} \\cdot A_v \\cdot (1 - e^{-t / \\tau}) \\\\[1.5ex]
        &\\textbf{Limites (Saturação):} \\quad \\mathbf{${data.vn}\\text{V}} \\le V_{out} \\le \\mathbf{${data.vp}\\text{V}} \\\\[1.5ex]
        &\\textbf{Atenuação (Roll-off):} \\quad \\mathbf{-20 \\text{ dB/década}}
      \\end{aligned}`;
    } else {
      latex = `\\begin{aligned}
        &\\textbf{Filtro Passa-Altas de 1a Ordem} \\\\[1.5ex]
        &\\textbf{Função de Transferência:} \\quad H(s) = \\frac{A_v s R_1 C_1}{1 + s R_1 C_1} \\\\[1.5ex]
        &\\textbf{Valores Comerciais:} \\quad R_1 = \\mathbf{${formatEngineeringValue(data.r1, '\\Omega')}}, \\ C_1 = \\mathbf{${formatEngineeringValue(data.c1, 'F')}} \\\\[1.5ex]
        &\\textbf{Cálculo de } f_c: \\quad f_c = \\frac{1}{2\\pi R_1 C_1} = \\mathbf{${data.fc.toFixed(1)}\\text{ Hz}} \\\\[1.5ex]
        &\\textbf{Polo do Sistema:} \\quad p_1 = -\\frac{1}{R_1 C_1} = \\mathbf{${(-1/(data.r1*data.c1)).toFixed(1)}\\text{ rad/s}} \\\\[1.5ex]
        &\\textbf{Ganho Linear } (A_v): \\quad A_v = 1 + \\frac{R_3}{R_4} = \\mathbf{${data.gain.toFixed(3)}} \\\\[1.5ex]
        &\\textbf{Ganho } (\\text{dB}): \\quad A_{dB} = 20 \\log_{10}(A_v) = \\mathbf{${(20 * Math.log10(data.gain)).toFixed(2)} \\text{ dB}} \\\\[1.5ex]
        &\\textbf{Fase } \\phi(f): \\quad 90^\\circ - \\arctan\\left(\\frac{f}{f_c}\\right) \\\\[1.5ex]
        &\\textbf{Resposta ao Degrau:} \\quad V_{out}(t) = V_{in} \\cdot A_v \\cdot e^{-t / \\tau} \\\\[1.5ex]
        &\\textbf{Limites (Saturação):} \\quad \\mathbf{${data.vn}\\text{V}} \\le V_{out} \\le \\mathbf{${data.vp}\\text{V}} \\\\[1.5ex]
        &\\textbf{Atenuação (Roll-off):} \\quad \\mathbf{+20 \\text{ dB/década}}
      \\end{aligned}`;
    }
  } 
  else if (filterOrder.value === 2) {
    const T = data.rBase * data.cBase;
    const p1 = (-3 + Math.sqrt(5)) / (2 * T);
    const p2 = (-3 - Math.sqrt(5)) / (2 * T);
    
    if (filterType.value === 'lowpass') {
      latex = `\\begin{aligned}
        &\\textbf{Cascata RC de 2a Ordem (LPF)} \\\\[1.5ex]
        &\\textbf{Função de Transferência:} \\quad H(s) = \\frac{A_v}{T^2 s^2 + 3T s + 1} \\quad \\text{onde } T = RC \\\\[1.5ex]
        &\\textbf{Frequência Real } (f_c): \\quad f_{c2} = f_{c1} \\times 0,3742 = \\mathbf{${data.fc.toFixed(1)}\\text{ Hz}} \\\\[1.5ex]
        &\\textbf{Polos Reais:} \\quad p_1 = \\mathbf{${p1.toFixed(1)}\\text{ rad/s}}, \\ p_2 = \\mathbf{${p2.toFixed(1)}\\text{ rad/s}} \\\\[1.5ex]
        &\\textbf{Fator de Qualidade } (Q): \\quad Q = \\frac{1}{3} \\approx \\mathbf{0,333} \\ \\text{(Superamortecido)} \\\\[1.5ex]
        &\\textbf{Ganho Linear } (A_v): \\quad A_v = 1 + \\frac{R_3}{R_4} = \\mathbf{${data.gain.toFixed(3)}} \\\\[1.5ex]
        &\\textbf{Ganho } (\\text{dB}): \\quad A_{dB} = 20 \\log_{10}(A_v) = \\mathbf{${(20 * Math.log10(data.gain)).toFixed(2)} \\text{ dB}} \\\\[1.5ex]
        &\\textbf{Fase } \\phi(f): \\quad -\\arctan\\left(\\frac{3 \\omega T}{1 - \\omega^2 T^2}\\right) \\\\[1.5ex]
        &\\textbf{Resposta ao Degrau:} \\quad V_{out}(t) = V_{in} A_v \\left( 1 + \\frac{p_2 e^{p_1 t} - p_1 e^{p_2 t}}{p_1 - p_2} \\right) \\\\[1.5ex]
        &\\textbf{Limites (Saturação):} \\quad \\mathbf{${data.vn}\\text{V}} \\le V_{out} \\le \\mathbf{${data.vp}\\text{V}} \\\\[1.5ex]
        &\\textbf{Atenuação (Roll-off):} \\quad \\mathbf{-40 \\text{ dB/década}}
      \\end{aligned}`;
    } else {
      latex = `\\begin{aligned}
        &\\textbf{Cascata RC de 2a Ordem (HPF)} \\\\[1.5ex]
        &\\textbf{Função de Transferência:} \\quad H(s) = \\frac{A_v T^2 s^2}{T^2 s^2 + 3T s + 1} \\quad \\text{onde } T = RC \\\\[1.5ex]
        &\\textbf{Frequência Real } (f_c): \\quad f_{c2} = \\frac{f_{c1}}{0,3742} = \\mathbf{${data.fc.toFixed(1)}\\text{ Hz}} \\\\[1.5ex]
        &\\textbf{Polos Reais:} \\quad p_1 = \\mathbf{${p1.toFixed(1)}\\text{ rad/s}}, \\ p_2 = \\mathbf{${p2.toFixed(1)}\\text{ rad/s}} \\\\[1.5ex]
        &\\textbf{Fator de Qualidade } (Q): \\quad Q = \\frac{1}{3} \\approx \\mathbf{0,333} \\ \\text{(Superamortecido)} \\\\[1.5ex]
        &\\textbf{Ganho Linear } (A_v): \\quad A_v = 1 + \\frac{R_3}{R_4} = \\mathbf{${data.gain.toFixed(3)}} \\\\[1.5ex]
        &\\textbf{Ganho } (\\text{dB}): \\quad A_{dB} = 20 \\log_{10}(A_v) = \\mathbf{${(20 * Math.log10(data.gain)).toFixed(2)} \\text{ dB}} \\\\[1.5ex]
        &\\textbf{Fase } \\phi(f): \\quad 180^\\circ - \\arctan\\left(\\frac{3 \\omega T}{1 - \\omega^2 T^2}\\right) \\\\[1.5ex]
        &\\textbf{Resposta ao Degrau:} \\quad V_{out}(t) = V_{in} A_v \\left( \\frac{p_1 e^{p_1 t} - p_2 e^{p_2 t}}{p_1 - p_2} \\right) \\\\[1.5ex]
        &\\textbf{Limites (Saturação):} \\quad \\mathbf{${data.vn}\\text{V}} \\le V_{out} \\le \\mathbf{${data.vp}\\text{V}} \\\\[1.5ex]
        &\\textbf{Atenuação (Roll-off):} \\quad \\mathbf{+40 \\text{ dB/década}}
      \\end{aligned}`;
    }
  }

  return katex.renderToString(latex, { throwOnError: false, displayMode: true });
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

// Frequency Response Curve Simulator (50 logarithmic points)
const simulatedPoints = computed(() => {
  const data = designData.value;
  const points = [];
  const logStart = Math.log10(100);    // Fixed 100 Hz
  const logEnd = Math.log10(1000000);  // Fixed 1 MHz
  const steps = 60;
  
  for (let i = 0; i <= steps; i++) {
    const logF = logStart + (i / steps) * (logEnd - logStart);
    const f = Math.pow(10, logF);
    const fRatio = f / data.fc;
    
    let gLinear = 0;
    let phase = 0;
    
    // 1st Order LPF
    if (filterType.value === 'lowpass' && filterOrder.value === 1) {
      gLinear = data.gain / Math.sqrt(1 + fRatio * fRatio);
      phase = -Math.atan(fRatio) * (180 / Math.PI);
    }
    // 1st Order HPF
    else if (filterType.value === 'highpass' && filterOrder.value === 1) {
      gLinear = (data.gain * fRatio) / Math.sqrt(1 + fRatio * fRatio);
      phase = Math.atan(1 / fRatio) * (180 / Math.PI);
    }
    // 2nd Order LPF/HPF (Passive Cascade)
    else if (filterOrder.value === 2) {
      if (filterType.value === 'lowpass') {
        const f0_local = data.fc / 0.3742;
        const ratio = f / f0_local;
        gLinear = Math.abs(data.gain) / Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(3 * ratio, 2));
        phase = -Math.atan2(3 * ratio, 1 - ratio * ratio) * (180 / Math.PI);
      } else {
        const f0_local = data.fc * 0.3742;
        const ratio = f / f0_local;
        const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(3 * ratio, 2));
        gLinear = (Math.abs(data.gain) * ratio * ratio) / denom;
        phase = (Math.PI - Math.atan2(3 * ratio, 1 - ratio * ratio)) * (180 / Math.PI);
      }
    }
    
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

const width = 1200;
const height = 300;
const margin = { top: 25, right: 40, bottom: 35, left: 50 };
const innerW = width - margin.left - margin.right;
const innerH = height - margin.top - margin.bottom;

const getX = (f: number): number => {
  const points = simulatedPoints.value;
  if (points.length === 0) return 0;
  const xMin = points[0].freq;
  const xMax = points[points.length - 1].freq;
  const logXMin = Math.log10(xMin || 0.1);
  const logXMax = Math.log10(xMax || 1000);
  const pct = (Math.log10(f || 0.1) - logXMin) / (logXMax - logXMin);
  return margin.left + pct * innerW;
};

const getYMag = (db: number): number => {
  const minDb = -60;
  const maxDb = 40;
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  const pct = (clamped - minDb) / (maxDb - minDb);
  return margin.top + (1 - pct) * innerH;
};

const getYPhase = (ph: number): number => {
  const pMin = -180;
  const pMax = 180;
  const clamped = Math.max(pMin, Math.min(pMax, ph));
  const pct = (clamped - pMin) / (pMax - pMin);
  return margin.top + (1 - pct) * innerH;
};

// SVG Chart Path Generator
const chartPaths = computed(() => {
  const points = simulatedPoints.value;
  if (points.length === 0) return { magPath: '', phasePath: '', gridLines: [] as Array<{ x?: number; y?: number; label: string; type: string }> };
  
  // Generate SVG path strings
  let magPath = '';
  let phasePath = '';
  
  points.forEach((p, idx) => {
    const x = getX(p.freq);
    const yM = getYMag(p.gDb);
    const yP = getYPhase(p.phase);
    
    if (idx === 0) {
      magPath = `M ${x} ${yM}`;
      phasePath = `M ${x} ${yP}`;
    } else {
      magPath += ` L ${x} ${yM}`;
      phasePath += ` L ${x} ${yP}`;
    }
  });
  
  // Grid Lines
  const gridLines = [];
  // Generate decade ticks
  const xMin = points[0].freq;
  const xMax = points[points.length - 1].freq;
  const logXMin = Math.log10(xMin || 0.1);
  const logXMax = Math.log10(xMax || 1000);
  const startDec = Math.ceil(logXMin);
  const endDec = Math.floor(logXMax);
  for (let dec = startDec; dec <= endDec; dec++) {
    const val = Math.pow(10, dec);
    const x = getX(val);
    let label = `${val} Hz`;
    if (val >= 1000) label = `${(val / 1000).toFixed(0)} kHz`;
    gridLines.push({ x, label, type: 'v' });
  }
  
  // Horizontal grid lines for Magnitude
  const minDb = -60;
  const maxDb = 40;
  const dbStep = 20;
  for (let db = minDb; db <= maxDb; db += dbStep) {
    const y = getYMag(db);
    gridLines.push({ y, label: `${db}`, type: 'h-mag' });
  }
  
  // Horizontal grid lines for Phase
  const pMin = -180;
  const pMax = 180;
  const pStep = 90;
  for (let ph = pMin; ph <= pMax; ph += pStep) {
    const y = getYPhase(ph);
    gridLines.push({ y, label: `${ph}°`, type: 'h-phase' });
  }
  
  return {
    magPath,
    phasePath,
    gridLines
  };
});

// Interactive Tooltip on the Bode plot
const tooltipData = computed(() => {
  if (hoveredFreq.value === null) return null;
  const points = simulatedPoints.value;
  if (points.length === 0) return null;
  const f = hoveredFreq.value;
  
  // Find closest point
  let closest = points[0];
  let minDiff = Infinity;
  for (const p of points) {
    const diff = Math.abs(p.freq - f);
    if (diff < minDiff) {
      minDiff = diff;
      closest = p;
    }
  }
  
  const x = getX(closest.freq);
  const yMag = getYMag(closest.gDb);
  const yPhase = getYPhase(closest.phase);
  
  return {
    ...closest,
    x,
    yMag,
    yPhase
  };
});

function handleMouseMove(e: MouseEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const x = e.clientX - rect.left;
  
  if (x >= margin.left && x <= margin.left + innerW) {
    const pct = (x - margin.left) / innerW;
    const logXMin = Math.log10(simulatedPoints.value[0]?.freq || 0.1);
    const logXMax = Math.log10(simulatedPoints.value[simulatedPoints.value.length - 1]?.freq || 1000);
    const logF = logXMin + pct * (logXMax - logXMin);
    hoveredFreq.value = Math.pow(10, logF);
  } else {
    hoveredFreq.value = null;
  }
}

// Step Response Simulator
const stepResponsePoints = computed(() => {
  const data = designData.value;
  const points = [];
  const T = data.rBase * data.cBase; // RC time constant
  
  // Simulation bounds
  const tMax = 0.002; // Estático 2ms
  const vIn = 1;
  const steps = 100;
  
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * tMax;
    let vOut = 0;
    
    if (filterOrder.value === 1) {
      if (filterType.value === 'lowpass') {
        vOut = vIn * data.gain * (1 - Math.exp(-t / T));
      } else {
        vOut = vIn * data.gain * Math.exp(-t / T);
      }
    } else if (filterOrder.value === 2) {
      // 2nd Order Passive Cascade: poles at (-3 +- sqrt(5))/(2T)
      const p1 = (-3 + Math.sqrt(5)) / (2 * T);
      const p2 = (-3 - Math.sqrt(5)) / (2 * T);
      
      if (filterType.value === 'lowpass') {
        vOut = vIn * data.gain * (1 + (p2 * Math.exp(p1 * t) - p1 * Math.exp(p2 * t)) / (p1 - p2));
      } else {
        vOut = vIn * data.gain * (p1 * Math.exp(p1 * t) - p2 * Math.exp(p2 * t)) / (p1 - p2);
      }
    }
    
    // Clip to power supply rails
    if (vOut > data.vp) vOut = data.vp;
    if (vOut < data.vn) vOut = data.vn;
    
    points.push({ t, vOut });
  }
  return { points, tMax };
});

const stepChartPaths = computed(() => {
  const { points, tMax } = stepResponsePoints.value;
  if (points.length === 0) return { path: '', gridLines: [] };
  
  const vMax = 15;
  const vMin = -15;
  const vRange = 30;
  
  const getX = (t: number) => margin.left + (t / tMax) * innerW;
  const getY = (v: number) => {
    const pct = (v - vMin) / vRange;
    return margin.top + (1 - pct) * innerH;
  };
  
  let path = '';
  points.forEach((p, idx) => {
    const x = getX(p.t);
    const y = getY(p.vOut);
    if (idx === 0) path = `M ${x} ${y}`;
    else path += ` L ${x} ${y}`;
  });
  
  const gridLines = [];
  
  for (let v = -15; v <= 15; v += 5) {
    gridLines.push({ y: getY(v), label: `${v}V` });
  }
  
  gridLines.push({ y: getY(0), type: 'zero-line' }); // 0V reference
  if (filterType.value === 'lowpass') {
    gridLines.push({ y: getY(designData.value.gain), type: 'target-line' }); // Target gain
  }
  
  return { path, gridLines };
});

// Injects the designed theoretical response curve into the parent component's experimental bench data
function exportSimulatedToBench() {
  const data = designData.value;
  // Generate exactly 10 standard decade points to populate the bench table beautifully
  const pointsToExport: Array<{ freq: number; vMax: number; vMin: number; phase: number | null }> = [];
  const decadeFactors = [0.1, 0.2, 0.5, 0.8, 1.0, 1.2, 2.0, 5.0, 10.0, 20.0];
  
  decadeFactors.forEach(factor => {
    const f = data.fc * factor;
    const fRatio = f / data.fc;
    let gLinear = 0;
    let phase = 0;
    
    if (filterType.value === 'lowpass' && filterOrder.value === 1) {
      gLinear = data.gain / Math.sqrt(1 + fRatio * fRatio);
      phase = -Math.atan(fRatio) * (180 / Math.PI);
    } else if (filterType.value === 'highpass' && filterOrder.value === 1) {
      gLinear = (data.gain * fRatio) / Math.sqrt(1 + fRatio * fRatio);
      phase = Math.atan(1 / fRatio) * (180 / Math.PI);
    } else if (filterType.value === 'lowpass' && filterOrder.value === 2) {
      const f0_local = data.fc / 0.3742;
      const ratio = f / f0_local;
      gLinear = Math.abs(data.gain) / Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(3 * ratio, 2));
      phase = -Math.atan2(3 * ratio, 1 - ratio * ratio) * (180 / Math.PI);
    } else if (filterType.value === 'highpass' && filterOrder.value === 2) {
      const f0_local = data.fc * 0.3742;
      const ratio = f / f0_local;
      const denom = Math.sqrt(Math.pow(1 - ratio * ratio, 2) + Math.pow(3 * ratio, 2));
      gLinear = (Math.abs(data.gain) * ratio * ratio) / denom;
      phase = (Math.PI - Math.atan2(3 * ratio, 1 - ratio * ratio)) * (180 / Math.PI);
    }
    
    // We mock Vmax and Vmin based on a 1.0 V input to allow automatic processing
    const vMax = gLinear / 2;
    const vMin = -gLinear / 2;
    
    pointsToExport.push({
      freq: parseFloat(f.toFixed(1)),
      vMax: parseFloat(vMax.toFixed(5)),
      vMin: parseFloat(vMin.toFixed(5)),
      phase: parseFloat(phase.toFixed(1))
    });
  });
  
  emit('exportSimulatedData', pointsToExport);
}
</script>

<template>
  <div class="flex flex-col gap-6 w-full">
    <!-- All UI Cards Stacked Vertically -->
    
    <!-- 1. Filter controls and configurations -->
    <div class="flex flex-col gap-5">

      <div class="cb-card p-5">
        <div class="cb-card-header">
          <span class="accent-dot"></span>
          <h2>Parâmetros do Filtro Ativo</h2>
        </div>

        <!-- Target Frequency Calculator -->
        <div class="cb-calc-surface text-xs">
          <span class="cb-section-label flex items-center gap-1 mb-2" style="color:var(--primary-text)">
            <span class="material-symbols-outlined text-[15px]">calculate</span>
            Calculadora de Componentes Comerciais
          </span>
          <p class="cb-subtitle mb-3">
            Digite a frequência alvo e o sistema calculará os valores comerciais ideais de Resistores (E24) e Capacitores (E12).
          </p>
          <div class="flex gap-2 items-end">
            <div class="flex-1 space-y-1">
              <label class="cb-label">Frequência Alvo (Hz)</label>
              <input 
                type="text" 
                v-model="targetFc" 
                class="cb-input" 
                placeholder="ex: 5k"
              />
            </div>
            <button 
              @click="calculateCommercialValues"
              type="button"
              class="cb-btn h-[38px]">
              Calcular R e C
            </button>
          </div>

          <div v-if="calculatorResult" class="cb-calc-result">
            <div class="grid grid-cols-2 gap-2 text-[10px]">
              <div><span style="color:var(--text-tertiary)">Resistor Base:</span> <strong class="cb-summary-value">{{ calculatorResult.r }}Ω</strong></div>
              <div><span style="color:var(--text-tertiary)">Capacitor Base:</span> <strong class="cb-summary-value">{{ calculatorResult.c }}F</strong></div>
              <div><span style="color:var(--text-tertiary)">fc (1º Estágio):</span> <strong>{{ calculatorResult.fc1.toFixed(1) }} Hz</strong></div>
              <div><span style="color:var(--text-tertiary)">fc (Cascata):</span> <strong>{{ calculatorResult.fc2.toFixed(1) }} Hz</strong></div>
              <div class="col-span-2"><span style="color:var(--text-tertiary)">Erro:</span> <strong :style="calculatorResult.error < 5 ? 'color:var(--success-text)' : 'color:var(--error-text)'">{{ calculatorResult.error.toFixed(2) }}%</strong></div>
            </div>
          </div>
        </div>
        
        <div class="space-y-4 text-xs">
          <!-- Filter Type LPF / HPF -->
          <div class="space-y-1">
            <span class="cb-section-label">Tipo de Filtro</span>
            <div class="grid grid-cols-2 gap-2 mt-1">
              <button 
                @click="filterType = 'lowpass'" 
                :class="['cb-chip', filterType === 'lowpass' ? 'cb-chip-active' : '']">
                Passa-Baixas (LPF)
              </button>
              <button 
                @click="filterType = 'highpass'" 
                :class="['cb-chip', filterType === 'highpass' ? 'cb-chip-active' : '']">
                Passa-Altas (HPF)
              </button>
            </div>
          </div>
          
          <!-- Filter Order 1st / 2nd -->
          <div class="space-y-1">
            <span class="cb-section-label">Ordem do Filtro (Circuitos do Professor)</span>
            <div class="grid grid-cols-2 gap-2 mt-1">
              <button 
                @click="filterOrder = 1" 
                :class="['cb-chip', filterOrder === 1 ? 'cb-chip-active' : '']">
                1ª Ordem (-20 dB)
              </button>
              <button 
                @click="filterOrder = 2" 
                :class="['cb-chip', filterOrder === 2 ? 'cb-chip-active' : '']">
                Cascata de 2ª Ordem
              </button>
            </div>
          </div>

          <hr class="cb-divider" />

          <!-- Resistor and Capacitor base selection -->
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="cb-label">Resistor Base (R)</label>
              <input 
                type="text" 
                v-model="inputR" 
                class="cb-input" 
                placeholder="ex: 1.5k"
              />
            </div>
            <div class="space-y-1">
              <label class="cb-label">Capacitor Base (C)</label>
              <input 
                type="text" 
                v-model="inputC" 
                class="cb-input" 
                placeholder="ex: 22n"
              />
            </div>
          </div>

          <!-- Gain config resistors (Not applicable for MFB or pure Followers) -->
          <div class="space-y-2 mt-2" style="border-top:1px solid var(--border-subtle);padding-top:14px">
            <div class="flex items-center justify-between">
              <span class="cb-section-label" style="margin-bottom:0">Amplificador Operacional</span>
              <label class="cb-check">
                <input type="checkbox" v-model="voltageFollower" />
                Seguidor (Ganho = 1)
              </label>
            </div>
            
            <div class="grid grid-cols-2 gap-3" v-if="!voltageFollower">
              <div class="space-y-1">
                <label class="cb-label">Resistor R3 (Rf)</label>
                <input 
                  type="text" 
                  v-model="inputR3" 
                  class="cb-input" 
                  placeholder="ex: 10k"
                />
              </div>
              <div class="space-y-1">
                <label class="cb-label">Resistor R4 (Rg)</label>
                <input 
                  type="text" 
                  v-model="inputR4" 
                  class="cb-input" 
                  placeholder="ex: 10k"
                />
              </div>
            </div>
          </div>

          <!-- Power Supply config -->
          <div class="space-y-2 mt-2" style="border-top:1px solid var(--border-subtle);padding-top:14px">
            <span class="cb-section-label">Alimentação Simétrica</span>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <label class="cb-label">Fonte V+ (Vcc)</label>
                <input 
                  type="text" 
                  v-model="inputVp" 
                  class="cb-input" 
                  placeholder="ex: 12"
                />
              </div>
              <div class="space-y-1">
                <label class="cb-label">Fonte V− (Vee)</label>
                <input 
                  type="text" 
                  v-model="inputVn" 
                  class="cb-input" 
                  placeholder="ex: -12"
                />
              </div>
            </div>
          </div>
          
          <!-- Stability Warnings & Real-time results summary -->
          <div class="mt-4">
            <div v-if="!designData.isStable" class="cb-alert-error">
              <span class="material-symbols-outlined text-[18px] mt-0.5">warning</span>
              <div>
                <strong>Aviso de Instabilidade!</strong> O ganho configurado é de <strong>{{ designData.gain.toFixed(2) }}</strong> (Rf/Rg). Ganhos $\ge 3$ criam polos no semiplano direito para topologias de componentes iguais, transformando o circuito em um oscilador. Reduza Rf ou aumente Rg!
              </div>
            </div>
            
            <div v-else class="cb-summary">
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Ganho Teórico</span>
                <span class="cb-summary-value">{{ designData.gain.toFixed(2) }} ({{ (designData.gain > 0 ? 20 * Math.log10(Math.abs(designData.gain)) : -100).toFixed(1) }} dB)</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Fator de Qualidade (Q)</span>
                <span class="cb-summary-value">{{ designData.qFactor.toFixed(3) }}</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Estabilidade</span>
                <span class="cb-status cb-status-ok"><span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span> Estável</span>
              </div>
              <div class="flex flex-col gap-0.5">
                <span class="cb-summary-label">Roll-off</span>
                <span class="cb-summary-value">{{ designData.rollOff }} dB/década</span>
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
          Com base nos parâmetros desejados, a reorganização de fórmulas determina o valor exato dos resistores. Veja a substituição algébrica correspondente:
        </p>
        
        <div class="cb-inset p-6 flex flex-col justify-center min-h-[140px] text-base font-mono overflow-x-auto" style="color:var(--text-primary)">
          <div v-html="katexFormulaHtml" class="math-container"></div>
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
        
        <!-- SVG Container (Fills remaining height) -->
        <div class="cb-inset flex-1 min-h-[260px] p-2 flex items-center justify-center relative overflow-hidden select-none">
          
          <!-- CASE 1: LPF 1st Order Active Filter (Professor's Circuit) -->
          <svg v-if="filterType === 'lowpass' && filterOrder === 1" viewBox="0 0 520 270" class="w-full max-w-[500px] h-auto stroke-slate-800 dark:stroke-slate-300 fill-none font-mono text-[10px] transition-all">
            <!-- OpAmp — Standard 741: (-) on top, (+) on bottom -->
            <path d="M 300 90 L 300 190 L 365 140 Z" stroke-width="2.5" class="fill-white dark:fill-slate-900" />
            <text x="312" y="122" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">−</text>
            <text x="312" y="162" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">+</text>

            <!-- Power Supplies (+Vcc / -Vcc) -->
            <g class="power-supply stroke-slate-800 dark:stroke-slate-300">
              <!-- Pin Labels -->
              <text x="340" y="105" class="stroke-none fill-rose-600 dark:fill-rose-400 font-sans text-[10px] font-bold">V+</text>
              <text x="340" y="185" class="stroke-none fill-blue-600 dark:fill-blue-400 font-sans text-[10px] font-bold">V-</text>
              
              <!-- +Vcc (Pin 7) Wire with jump over feedback -->
              <line x1="335" y1="116" x2="335" y2="75" stroke-width="1.5" />
              <path d="M 335 75 L 376 75 A 4 4 0 0 1 384 75 L 480 75" stroke-width="1.5" class="fill-none" />
              
              <!-- Battery V2 (Top) -->
              <line x1="470" y1="75" x2="490" y2="75" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="85" x2="485" y2="85" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="95" x2="490" y2="95" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="105" x2="485" y2="105" stroke-width="1.5" /> <!-- Negative -->
              <text x="465" y="93" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V2</text>
              <text x="500" y="93" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ designData.vp }}V</text>
              
              <!-- -Vcc (Pin 4) Wire -->
              <line x1="335" y1="164" x2="335" y2="205" stroke-width="1.5" />
              <line x1="335" y1="205" x2="480" y2="205" stroke-width="1.5" />
              
              <!-- Battery V3 (Bottom) -->
              <line x1="475" y1="205" x2="485" y2="205" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="195" x2="490" y2="195" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="185" x2="485" y2="185" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="175" x2="490" y2="175" stroke-width="2" /> <!-- Positive -->
              <text x="465" y="193" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V3</text>
              <text x="500" y="193" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ Math.abs(designData.vn) }}V</text>
              
              <!-- Middle connection & Ground -->
              <line x1="480" y1="105" x2="480" y2="175" stroke-width="1.5" />
              <circle cx="480" cy="140" r="2.5" class="fill-slate-800 dark:fill-slate-200 stroke-none" />
              <line x1="480" y1="140" x2="495" y2="140" stroke-width="1.5" />
              <!-- Ground pointing right -->
              <line x1="495" y1="130" x2="495" y2="150" stroke-width="1.5" />
              <line x1="499" y1="134" x2="499" y2="146" stroke-width="1.5" />
              <line x1="503" y1="138" x2="503" y2="142" stroke-width="1.5" />
            </g>

            <!-- Wire to (+) input at y=165 -->
            <line x1="130" y1="165" x2="300" y2="165" stroke-width="2" />
            <!-- Wire to (−) input at y=115 -->
            <line x1="250" y1="115" x2="300" y2="115" stroke-width="2" />

            <!-- VIN -->
            <line x1="20" y1="165" x2="40" y2="165" stroke-width="2" />
            <circle cx="20" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="8" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VIN</text>

            <!-- Resistor R1 (Horizontal, input) -->
            <path d="M 40 165 L 50 165 L 55 157 L 63 173 L 71 157 L 79 173 L 87 157 L 95 173 L 100 165 L 120 165" stroke-width="2" />
            <text x="70" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R1 = {{ formatEngineeringValue(designData.r1, 'Ω') }}</text>

            <!-- Junction at x=130 -->
            <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- Capacitor C1 (Vertical to Ground) from junction -->
            <line x1="130" y1="165" x2="130" y2="198" stroke-width="2" />
            <line x1="118" y1="198" x2="142" y2="198" stroke-width="2.5" />
            <line x1="118" y1="202" x2="142" y2="202" stroke-width="2.5" />
            <line x1="130" y1="202" x2="130" y2="222" stroke-width="2" />
            <!-- Ground -->
            <line x1="118" y1="222" x2="142" y2="222" stroke-width="2" />
            <line x1="123" y1="226" x2="137" y2="226" stroke-width="1.5" />
            <line x1="128" y1="230" x2="132" y2="230" stroke-width="1" />
            <text x="130" y="248" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C1 = {{ formatEngineeringValue(designData.c1, 'F') }}</text>

            <!-- ═══ FEEDBACK NETWORK ═══ -->
            <!-- Feedback Junction at (250, 115) -->
            <circle cx="250" cy="115" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <g v-if="voltageFollower">
              <!-- Voltage Follower: output directly to (−) -->
              <line x1="380" y1="140" x2="380" y2="75" stroke-width="2" />
              <line x1="380" y1="75" x2="250" y2="75" stroke-width="2" />
              <line x1="250" y1="75" x2="250" y2="115" stroke-width="2" />
              <text x="310" y="68" text-anchor="middle" class="stroke-none fill-slate-400 font-sans text-[8px] italic">Seguidor (Ganho Unitário)</text>
            </g>
            <g v-else>
              <!-- R2 (Rg, horizontal LEFT from junction to ground) -->
              <path d="M 170 115 L 178 115 L 183 107 L 191 123 L 199 107 L 207 123 L 215 107 L 223 123 L 228 115 L 250 115" stroke-width="2" />
              <text x="200" y="100" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R2 = {{ formatEngineeringValue(designData.r4, 'Ω') }}</text>
              <!-- R2 ground at left end -->
              <line x1="170" y1="115" x2="170" y2="138" stroke-width="2" />
              <line x1="158" y1="138" x2="182" y2="138" stroke-width="2" />
              <line x1="163" y1="142" x2="177" y2="142" stroke-width="1.5" />
              <line x1="168" y1="146" x2="172" y2="146" stroke-width="1" />

              <!-- R3 (Rf, feedback ABOVE opamp from junction to output) -->
              <line x1="250" y1="115" x2="250" y2="52" stroke-width="2" />
              <path d="M 250 52 L 270 52 L 275 44 L 283 60 L 291 44 L 299 60 L 307 44 L 315 60 L 320 52 L 380 52" stroke-width="2" />
              <text x="300" y="40" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R3 = {{ formatEngineeringValue(designData.r3, 'Ω') }}</text>
              <!-- Down from R3 to output junction -->
              <line x1="380" y1="52" x2="380" y2="140" stroke-width="2" />
            </g>

            <!-- Output junction -->
            <circle cx="380" cy="140" r="3" class="fill-slate-800 dark:fill-slate-200" />
            <!-- Output Node -->
            <line x1="365" y1="140" x2="430" y2="140" stroke-width="2" />
            <circle cx="430" cy="140" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="438" y="143" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
          </svg>

          <!-- CASE 2: HPF 1st Order Active Filter -->
          <svg v-if="filterType === 'highpass' && filterOrder === 1" viewBox="0 0 520 270" class="w-full max-w-[500px] h-auto stroke-slate-800 dark:stroke-slate-300 fill-none font-mono text-[10px] transition-all">
            <!-- OpAmp — Standard 741: (-) on top, (+) on bottom -->
            <path d="M 300 90 L 300 190 L 365 140 Z" stroke-width="2.5" class="fill-white dark:fill-slate-900" />
            <text x="312" y="122" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">−</text>
            <text x="312" y="162" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">+</text>

            <!-- Power Supplies (+Vcc / -Vcc) -->
            <g class="power-supply stroke-slate-800 dark:stroke-slate-300">
              <!-- Pin Labels -->
              <text x="340" y="105" class="stroke-none fill-rose-600 dark:fill-rose-400 font-sans text-[10px] font-bold">V+</text>
              <text x="340" y="185" class="stroke-none fill-blue-600 dark:fill-blue-400 font-sans text-[10px] font-bold">V-</text>
              
              <!-- +Vcc (Pin 7) Wire with jump over feedback -->
              <line x1="335" y1="116" x2="335" y2="75" stroke-width="1.5" />
              <path d="M 335 75 L 376 75 A 4 4 0 0 1 384 75 L 480 75" stroke-width="1.5" class="fill-none" />
              
              <!-- Battery V2 (Top) -->
              <line x1="470" y1="75" x2="490" y2="75" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="85" x2="485" y2="85" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="95" x2="490" y2="95" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="105" x2="485" y2="105" stroke-width="1.5" /> <!-- Negative -->
              <text x="465" y="93" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V2</text>
              <text x="500" y="93" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ designData.vp }}V</text>
              
              <!-- -Vcc (Pin 4) Wire -->
              <line x1="335" y1="164" x2="335" y2="205" stroke-width="1.5" />
              <line x1="335" y1="205" x2="480" y2="205" stroke-width="1.5" />
              
              <!-- Battery V3 (Bottom) -->
              <line x1="475" y1="205" x2="485" y2="205" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="195" x2="490" y2="195" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="185" x2="485" y2="185" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="175" x2="490" y2="175" stroke-width="2" /> <!-- Positive -->
              <text x="465" y="193" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V3</text>
              <text x="500" y="193" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ Math.abs(designData.vn) }}V</text>
              
              <!-- Middle connection & Ground -->
              <line x1="480" y1="105" x2="480" y2="175" stroke-width="1.5" />
              <circle cx="480" cy="140" r="2.5" class="fill-slate-800 dark:fill-slate-200 stroke-none" />
              <line x1="480" y1="140" x2="495" y2="140" stroke-width="1.5" />
              <!-- Ground pointing right -->
              <line x1="495" y1="130" x2="495" y2="150" stroke-width="1.5" />
              <line x1="499" y1="134" x2="499" y2="146" stroke-width="1.5" />
              <line x1="503" y1="138" x2="503" y2="142" stroke-width="1.5" />
            </g>

            <!-- Wire to (+) input at y=165 -->
            <line x1="130" y1="165" x2="300" y2="165" stroke-width="2" />
            <!-- Wire to (−) input at y=115 -->
            <line x1="250" y1="115" x2="300" y2="115" stroke-width="2" />

            <!-- VIN -->
            <line x1="20" y1="165" x2="40" y2="165" stroke-width="2" />
            <circle cx="20" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="8" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VIN</text>

            <!-- Capacitor C1 (Horizontal) -->
            <line x1="40" y1="153" x2="40" y2="177" stroke-width="2.5" />
            <line x1="44" y1="153" x2="44" y2="177" stroke-width="2.5" />
            <line x1="44" y1="165" x2="120" y2="165" stroke-width="2" />
            <text x="70" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C1 = {{ formatEngineeringValue(designData.c1, 'F') }}</text>

            <!-- Junction at x=130 -->
            <circle cx="130" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- Resistor R1 (Vertical to Ground) at junction -->
            <line x1="130" y1="165" x2="130" y2="180" stroke-width="2" />
            <path d="M 130 180 L 130 188 L 122 193 L 138 201 L 122 209 L 138 217 L 130 222 L 130 235" stroke-width="2" />
            <!-- Ground -->
            <line x1="118" y1="235" x2="142" y2="235" stroke-width="2" />
            <line x1="123" y1="239" x2="137" y2="239" stroke-width="1.5" />
            <line x1="128" y1="243" x2="132" y2="243" stroke-width="1" />
            <text x="130" y="258" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R1 = {{ formatEngineeringValue(designData.r1, 'Ω') }}</text>

            <!-- ═══ FEEDBACK NETWORK ═══ -->
            <circle cx="250" cy="115" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <g v-if="voltageFollower">
              <line x1="380" y1="140" x2="380" y2="75" stroke-width="2" />
              <line x1="380" y1="75" x2="250" y2="75" stroke-width="2" />
              <line x1="250" y1="75" x2="250" y2="115" stroke-width="2" />
            </g>
            <g v-else>
              <!-- R2 (Rg, horizontal LEFT from junction to ground) -->
              <path d="M 170 115 L 178 115 L 183 107 L 191 123 L 199 107 L 207 123 L 215 107 L 223 123 L 228 115 L 250 115" stroke-width="2" />
              <text x="200" y="100" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R2 = {{ formatEngineeringValue(designData.r4, 'Ω') }}</text>
              <line x1="170" y1="115" x2="170" y2="138" stroke-width="2" />
              <line x1="158" y1="138" x2="182" y2="138" stroke-width="2" />
              <line x1="163" y1="142" x2="177" y2="142" stroke-width="1.5" />
              <line x1="168" y1="146" x2="172" y2="146" stroke-width="1" />

              <!-- R3 (Rf, feedback ABOVE opamp) -->
              <line x1="250" y1="115" x2="250" y2="52" stroke-width="2" />
              <path d="M 250 52 L 270 52 L 275 44 L 283 60 L 291 44 L 299 60 L 307 44 L 315 60 L 320 52 L 380 52" stroke-width="2" />
              <text x="300" y="40" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R3 = {{ formatEngineeringValue(designData.r3, 'Ω') }}</text>
              <line x1="380" y1="52" x2="380" y2="140" stroke-width="2" />
            </g>

            <circle cx="380" cy="140" r="3" class="fill-slate-800 dark:fill-slate-200" />
            <line x1="365" y1="140" x2="430" y2="140" stroke-width="2" />
            <circle cx="430" cy="140" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="438" y="143" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
          </svg>

          <!-- CASE 3: LPF Passive Cascade 2nd Order Active Filter (Professor's Circuit) -->
          <svg v-if="filterType === 'lowpass' && filterOrder === 2" viewBox="0 0 520 270" class="w-full max-w-[500px] h-auto stroke-slate-800 dark:stroke-slate-300 fill-none font-mono text-[10px] transition-all">
            <!-- OpAmp — Standard 741: (-) on top, (+) on bottom -->
            <path d="M 300 90 L 300 190 L 365 140 Z" stroke-width="2.5" class="fill-white dark:fill-slate-900" />
            <text x="312" y="122" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">−</text>
            <text x="312" y="162" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">+</text>

            <!-- Power Supplies (+Vcc / -Vcc) -->
            <g class="power-supply stroke-slate-800 dark:stroke-slate-300">
              <!-- Pin Labels -->
              <text x="340" y="105" class="stroke-none fill-rose-600 dark:fill-rose-400 font-sans text-[10px] font-bold">V+</text>
              <text x="340" y="185" class="stroke-none fill-blue-600 dark:fill-blue-400 font-sans text-[10px] font-bold">V-</text>
              
              <!-- +Vcc (Pin 7) Wire with jump over feedback -->
              <line x1="335" y1="116" x2="335" y2="75" stroke-width="1.5" />
              <path d="M 335 75 L 376 75 A 4 4 0 0 1 384 75 L 480 75" stroke-width="1.5" class="fill-none" />
              
              <!-- Battery V2 (Top) -->
              <line x1="470" y1="75" x2="490" y2="75" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="85" x2="485" y2="85" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="95" x2="490" y2="95" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="105" x2="485" y2="105" stroke-width="1.5" /> <!-- Negative -->
              <text x="465" y="93" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V2</text>
              <text x="500" y="93" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ designData.vp }}V</text>
              
              <!-- -Vcc (Pin 4) Wire -->
              <line x1="335" y1="164" x2="335" y2="205" stroke-width="1.5" />
              <line x1="335" y1="205" x2="480" y2="205" stroke-width="1.5" />
              
              <!-- Battery V3 (Bottom) -->
              <line x1="475" y1="205" x2="485" y2="205" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="195" x2="490" y2="195" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="185" x2="485" y2="185" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="175" x2="490" y2="175" stroke-width="2" /> <!-- Positive -->
              <text x="465" y="193" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V3</text>
              <text x="500" y="193" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ Math.abs(designData.vn) }}V</text>
              
              <!-- Middle connection & Ground -->
              <line x1="480" y1="105" x2="480" y2="175" stroke-width="1.5" />
              <circle cx="480" cy="140" r="2.5" class="fill-slate-800 dark:fill-slate-200 stroke-none" />
              <line x1="480" y1="140" x2="495" y2="140" stroke-width="1.5" />
              <!-- Ground pointing right -->
              <line x1="495" y1="130" x2="495" y2="150" stroke-width="1.5" />
              <line x1="499" y1="134" x2="499" y2="146" stroke-width="1.5" />
              <line x1="503" y1="138" x2="503" y2="142" stroke-width="1.5" />
            </g>

            <!-- Wire to (+) input at y=165 -->
            <line x1="210" y1="165" x2="300" y2="165" stroke-width="2" />
            <!-- Wire to (−) input at y=115 -->
            <line x1="250" y1="115" x2="300" y2="115" stroke-width="2" />

            <!-- VIN -->
            <line x1="20" y1="165" x2="35" y2="165" stroke-width="2" />
            <circle cx="20" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="8" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VIN</text>

            <!-- Resistor R4 (Horizontal, first RC stage) -->
            <path d="M 35 165 L 43 165 L 48 157 L 56 173 L 64 157 L 72 173 L 80 157 L 88 173 L 93 165 L 100 165" stroke-width="2" />
            <text x="65" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R</text>
            <text x="65" y="185" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.r1, 'Ω') }}</text>

            <!-- Junction 1 at x=110 -->
            <circle cx="110" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- C2 (Vertical to Ground) from junction 1 -->
            <line x1="110" y1="165" x2="110" y2="198" stroke-width="2" />
            <line x1="98" y1="198" x2="122" y2="198" stroke-width="2.5" />
            <line x1="98" y1="202" x2="122" y2="202" stroke-width="2.5" />
            <line x1="110" y1="202" x2="110" y2="222" stroke-width="2" />
            <line x1="98" y1="222" x2="122" y2="222" stroke-width="2" />
            <line x1="103" y1="226" x2="117" y2="226" stroke-width="1.5" />
            <line x1="108" y1="230" x2="112" y2="230" stroke-width="1" />
            <text x="110" y="248" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C</text>
            <text x="110" y="258" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.c2, 'F') }}</text>

            <!-- Resistor R1 (Horizontal, second RC stage) -->
            <path d="M 110 165 L 120 165 L 125 157 L 133 173 L 141 157 L 149 173 L 157 157 L 165 173 L 170 165 L 180 165" stroke-width="2" />
            <text x="145" y="150" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R</text>
            <text x="145" y="185" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.r2, 'Ω') }}</text>

            <!-- Junction 2 at x=195 -->
            <line x1="180" y1="165" x2="195" y2="165" stroke-width="2" />
            <circle cx="195" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- C1 (Vertical to Ground) from junction 2 -->
            <line x1="195" y1="165" x2="195" y2="198" stroke-width="2" />
            <line x1="183" y1="198" x2="207" y2="198" stroke-width="2.5" />
            <line x1="183" y1="202" x2="207" y2="202" stroke-width="2.5" />
            <line x1="195" y1="202" x2="195" y2="222" stroke-width="2" />
            <line x1="183" y1="222" x2="207" y2="222" stroke-width="2" />
            <line x1="188" y1="226" x2="202" y2="226" stroke-width="1.5" />
            <line x1="193" y1="230" x2="197" y2="230" stroke-width="1" />
            <text x="195" y="248" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C</text>
            <text x="195" y="258" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.c1, 'F') }}</text>

            <!-- Wire from junction 2 to opamp (+) -->
            <line x1="195" y1="165" x2="300" y2="165" stroke-width="2" />

            <!-- ═══ FEEDBACK NETWORK ═══ -->
            <circle cx="250" cy="115" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <g v-if="voltageFollower">
              <line x1="380" y1="140" x2="380" y2="75" stroke-width="2" />
              <line x1="380" y1="75" x2="250" y2="75" stroke-width="2" />
              <line x1="250" y1="75" x2="250" y2="115" stroke-width="2" />
              <text x="310" y="68" text-anchor="middle" class="stroke-none fill-slate-400 font-sans text-[8px] italic">Seguidor (Ganho Unitário)</text>
            </g>
            <g v-else>
              <!-- R2 (Rg, horizontal LEFT from junction to ground) -->
              <path d="M 170 115 L 178 115 L 183 107 L 191 123 L 199 107 L 207 123 L 215 107 L 223 123 L 228 115 L 250 115" stroke-width="2" />
              <text x="200" y="100" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">Rg = {{ formatEngineeringValue(designData.r4, 'Ω') }}</text>
              <line x1="170" y1="115" x2="170" y2="138" stroke-width="2" />
              <line x1="158" y1="138" x2="182" y2="138" stroke-width="2" />
              <line x1="163" y1="142" x2="177" y2="142" stroke-width="1.5" />
              <line x1="168" y1="146" x2="172" y2="146" stroke-width="1" />

              <!-- R3 (Rf, feedback ABOVE opamp) -->
              <line x1="250" y1="115" x2="250" y2="52" stroke-width="2" />
              <path d="M 250 52 L 270 52 L 275 44 L 283 60 L 291 44 L 299 60 L 307 44 L 315 60 L 320 52 L 380 52" stroke-width="2" />
              <text x="300" y="40" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">Rf = {{ formatEngineeringValue(designData.r3, 'Ω') }}</text>
              <line x1="380" y1="52" x2="380" y2="140" stroke-width="2" />
            </g>

            <!-- Output junction -->
            <circle cx="380" cy="140" r="3" class="fill-slate-800 dark:fill-slate-200" />
            <!-- Output Node -->
            <line x1="365" y1="140" x2="430" y2="140" stroke-width="2" />
            <circle cx="430" cy="140" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="438" y="143" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
          </svg>

          <!-- CASE 4: HPF Passive Cascade 2nd Order Active Filter (Professor's Circuit) -->
          <svg v-if="filterType === 'highpass' && filterOrder === 2" viewBox="0 0 520 270" class="w-full max-w-[500px] h-auto stroke-slate-800 dark:stroke-slate-300 fill-none font-mono text-[10px] transition-all">
            <!-- OpAmp — Standard 741: (-) on top, (+) on bottom -->
            <path d="M 300 90 L 300 190 L 365 140 Z" stroke-width="2.5" class="fill-white dark:fill-slate-900" />
            <text x="312" y="122" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">−</text>
            <text x="312" y="162" class="stroke-none fill-slate-500 text-[12px] font-sans font-bold">+</text>

            <!-- Power Supplies (+Vcc / -Vcc) -->
            <g class="power-supply stroke-slate-800 dark:stroke-slate-300">
              <!-- Pin Labels -->
              <text x="340" y="105" class="stroke-none fill-rose-600 dark:fill-rose-400 font-sans text-[10px] font-bold">V+</text>
              <text x="340" y="185" class="stroke-none fill-blue-600 dark:fill-blue-400 font-sans text-[10px] font-bold">V-</text>
              
              <!-- +Vcc (Pin 7) Wire with jump over feedback -->
              <line x1="335" y1="116" x2="335" y2="75" stroke-width="1.5" />
              <path d="M 335 75 L 376 75 A 4 4 0 0 1 384 75 L 480 75" stroke-width="1.5" class="fill-none" />
              
              <!-- Battery V2 (Top) -->
              <line x1="470" y1="75" x2="490" y2="75" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="85" x2="485" y2="85" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="95" x2="490" y2="95" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="105" x2="485" y2="105" stroke-width="1.5" /> <!-- Negative -->
              <text x="465" y="93" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V2</text>
              <text x="500" y="93" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ designData.vp }}V</text>
              
              <!-- -Vcc (Pin 4) Wire -->
              <line x1="335" y1="164" x2="335" y2="205" stroke-width="1.5" />
              <line x1="335" y1="205" x2="480" y2="205" stroke-width="1.5" />
              
              <!-- Battery V3 (Bottom) -->
              <line x1="475" y1="205" x2="485" y2="205" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="195" x2="490" y2="195" stroke-width="2" /> <!-- Positive -->
              <line x1="475" y1="185" x2="485" y2="185" stroke-width="1.5" /> <!-- Negative -->
              <line x1="470" y1="175" x2="490" y2="175" stroke-width="2" /> <!-- Positive -->
              <text x="465" y="193" text-anchor="end" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">V3</text>
              <text x="500" y="193" class="stroke-none fill-slate-600 dark:fill-slate-400 font-bold font-sans text-[9px]">{{ Math.abs(designData.vn) }}V</text>
              
              <!-- Middle connection & Ground -->
              <line x1="480" y1="105" x2="480" y2="175" stroke-width="1.5" />
              <circle cx="480" cy="140" r="2.5" class="fill-slate-800 dark:fill-slate-200 stroke-none" />
              <line x1="480" y1="140" x2="495" y2="140" stroke-width="1.5" />
              <!-- Ground pointing right -->
              <line x1="495" y1="130" x2="495" y2="150" stroke-width="1.5" />
              <line x1="499" y1="134" x2="499" y2="146" stroke-width="1.5" />
              <line x1="503" y1="138" x2="503" y2="142" stroke-width="1.5" />
            </g>

            <!-- Wire to (+) input at y=165 -->
            <line x1="210" y1="165" x2="300" y2="165" stroke-width="2" />
            <!-- Wire to (−) input at y=115 -->
            <line x1="250" y1="115" x2="300" y2="115" stroke-width="2" />

            <!-- VIN -->
            <line x1="20" y1="165" x2="35" y2="165" stroke-width="2" />
            <circle cx="20" cy="165" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="8" y="158" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VIN</text>

            <!-- Capacitor C1 (Horizontal, first RC stage) -->
            <line x1="35" y1="165" x2="63" y2="165" stroke-width="2" />
            <line x1="63" y1="153" x2="63" y2="177" stroke-width="2.5" />
            <line x1="67" y1="153" x2="67" y2="177" stroke-width="2.5" />
            <line x1="67" y1="165" x2="110" y2="165" stroke-width="2" />
            <text x="65" y="145" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C</text>
            <text x="65" y="190" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.c1, 'F') }}</text>

            <!-- Junction 1 at x=110 -->
            <circle cx="110" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- Resistor R1 (Vertical to Ground) from junction 1 -->
            <line x1="110" y1="165" x2="110" y2="180" stroke-width="2" />
            <path d="M 110 180 L 110 188 L 102 193 L 118 201 L 102 209 L 118 217 L 110 222 L 110 235" stroke-width="2" />
            <line x1="98" y1="235" x2="122" y2="235" stroke-width="2" />
            <line x1="103" y1="239" x2="117" y2="239" stroke-width="1.5" />
            <line x1="108" y1="243" x2="112" y2="243" stroke-width="1" />
            <text x="135" y="215" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R</text>
            <text x="135" y="225" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.r1, 'Ω') }}</text>

            <!-- Capacitor C2 (Horizontal, second RC stage) -->
            <line x1="110" y1="165" x2="148" y2="165" stroke-width="2" />
            <line x1="148" y1="153" x2="148" y2="177" stroke-width="2.5" />
            <line x1="152" y1="153" x2="152" y2="177" stroke-width="2.5" />
            <line x1="152" y1="165" x2="195" y2="165" stroke-width="2" />
            <text x="150" y="145" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">C</text>
            <text x="150" y="190" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.c2, 'F') }}</text>

            <!-- Junction 2 at x=195 -->
            <circle cx="195" cy="165" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <!-- Resistor R2 (Vertical to Ground) from junction 2 -->
            <line x1="195" y1="165" x2="195" y2="180" stroke-width="2" />
            <path d="M 195 180 L 195 188 L 187 193 L 203 201 L 187 209 L 203 217 L 195 222 L 195 235" stroke-width="2" />
            <line x1="183" y1="235" x2="207" y2="235" stroke-width="2" />
            <line x1="188" y1="239" x2="202" y2="239" stroke-width="1.5" />
            <line x1="193" y1="243" x2="197" y2="243" stroke-width="1" />
            <text x="220" y="215" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">R</text>
            <text x="220" y="225" text-anchor="middle" class="stroke-none fill-teal-500 dark:fill-teal-400 text-[9px]">{{ formatEngineeringValue(designData.r2, 'Ω') }}</text>

            <!-- Wire from junction 2 to opamp (+) -->
            <line x1="195" y1="165" x2="300" y2="165" stroke-width="2" />

            <!-- ═══ FEEDBACK NETWORK ═══ -->
            <circle cx="250" cy="115" r="3" class="fill-slate-800 dark:fill-slate-200" />

            <g v-if="voltageFollower">
              <line x1="380" y1="140" x2="380" y2="75" stroke-width="2" />
              <line x1="380" y1="75" x2="250" y2="75" stroke-width="2" />
              <line x1="250" y1="75" x2="250" y2="115" stroke-width="2" />
              <text x="310" y="68" text-anchor="middle" class="stroke-none fill-slate-400 font-sans text-[8px] italic">Seguidor (Ganho Unitário)</text>
            </g>
            <g v-else>
              <!-- Rg (horizontal LEFT from junction to ground) -->
              <path d="M 170 115 L 178 115 L 183 107 L 191 123 L 199 107 L 207 123 L 215 107 L 223 123 L 228 115 L 250 115" stroke-width="2" />
              <text x="200" y="100" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">Rg = {{ formatEngineeringValue(designData.r4, 'Ω') }}</text>
              <line x1="170" y1="115" x2="170" y2="138" stroke-width="2" />
              <line x1="158" y1="138" x2="182" y2="138" stroke-width="2" />
              <line x1="163" y1="142" x2="177" y2="142" stroke-width="1.5" />
              <line x1="168" y1="146" x2="172" y2="146" stroke-width="1" />

              <!-- Rf (feedback ABOVE opamp) -->
              <line x1="250" y1="115" x2="250" y2="52" stroke-width="2" />
              <path d="M 250 52 L 270 52 L 275 44 L 283 60 L 291 44 L 299 60 L 307 44 L 315 60 L 320 52 L 380 52" stroke-width="2" />
              <text x="300" y="40" text-anchor="middle" class="stroke-none fill-teal-600 dark:fill-teal-400 font-bold">Rf = {{ formatEngineeringValue(designData.r3, 'Ω') }}</text>
              <line x1="380" y1="52" x2="380" y2="140" stroke-width="2" />
            </g>

            <!-- Output junction -->
            <circle cx="380" cy="140" r="3" class="fill-slate-800 dark:fill-slate-200" />
            <!-- Output Node -->
            <line x1="365" y1="140" x2="430" y2="140" stroke-width="2" />
            <circle cx="430" cy="140" r="3.5" class="fill-slate-800 dark:fill-slate-200" />
            <text x="438" y="143" class="stroke-none fill-slate-600 dark:fill-slate-400 font-sans font-bold text-[9px]">VOUT</text>
          </svg>
          
        </div>
      </div>
      
    </div>
    <OpampChartsPanel 
      :processed-data="(simulatedBodeData as any)"
      :cutoff-frequency="designData.fc"
      :step-response-data="stepResponsePoints.points"
    />
  </div>
</template>

<style scoped>
.math-container {
  overflow-x: auto;
  padding: 4px 0;
  width: 100%;
}
:deep(.katex-display) {
  margin: 0.2em 0 !important;
  overflow-x: auto;
  overflow-y: hidden;
}
:deep(.katex) {
  font-size: 0.94em !important;
  white-space: nowrap;
}
</style>
