<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import * as d3 from 'd3';
import { log10, pow, abs } from 'mathjs';
import type { ExperimentalData } from '../../utils/mathUtils';

const props = defineProps<{
  processedData: ExperimentalData[];
  cutoffFrequency?: number | null;
}>();

const activeTab = ref('bode-mag');
const frequencyScale = ref<'logarithmic' | 'linear'>('logarithmic');
const showDataPoints = ref(true);
const showCutoffLine = ref(true);

// D3 Containers
const containerBodeMag = ref<HTMLDivElement | null>(null);
const containerBodeDb = ref<HTMLDivElement | null>(null);
const containerBodePhase = ref<HTMLDivElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

// --- Theme ---
function getThemeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  return {
    text: isDark ? '#94a3b8' : '#334155', 
    title: isDark ? '#e2e8f0' : '#0f172a',
    grid: isDark ? 'rgba(51, 65, 85, 0.2)' : 'rgba(148, 163, 184, 0.4)',
    tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipTitle: isDark ? '#f8fafc' : '#0f172a',
    tooltipBody: isDark ? '#cbd5e1' : '#334155',
    crosshair: isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(51, 65, 85, 0.6)', 
    lineBorder: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.8)',
    bg: isDark ? '#020617' : '#f8fafc' // for export PNG
  };
}

function drawChart(
  container: HTMLDivElement | null, 
  rawData: ExperimentalData[], 
  yKey: keyof ExperimentalData, 
  yLabel: string, 
  lineColor: string,
  pointShape: 'circle' | 'triangle' | 'rect'
) {
  if (!container || rawData.length === 0) return;
  
  // 1. Filtrar dados vazios (ex: Fase não medida pelo aluno)
  const data = rawData.filter(d => d[yKey] !== null && d[yKey] !== undefined && !isNaN(d[yKey] as number));
  if (data.length === 0) {
    d3.select(container).selectAll('*').remove();
    return;
  }
  
  // Clear previous SVG
  d3.select(container).selectAll('*').remove();
  
  const width = container.clientWidth;
  const height = container.clientHeight;
  const margin = { top: 30, right: 30, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  const colors = getThemeColors();
  
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('font-family', 'Roboto, sans-serif');
    
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
    
  // X Scale
  const xMin = d3.min(data, d => d.freq) as number;
  const xMax = d3.max(data, d => d.freq) as number;
  
  let xScale: d3.ScaleLogarithmic<number, number> | d3.ScaleLinear<number, number>;
  if (frequencyScale.value === 'logarithmic') {
    xScale = d3.scaleLog().domain([Math.max(0.1, xMin), xMax]).range([0, innerWidth]);
  } else {
    xScale = d3.scaleLinear().domain([0, xMax]).range([0, innerWidth]);
  }
  
  // Y Scale
  const yMin = d3.min(data, d => d[yKey] as number) as number;
  const yMax = d3.max(data, d => d[yKey] as number) as number;
  
  const yPadding = (yMax - yMin) * 0.1 || 1;
  const yScale = d3.scaleLinear()
    .domain([yMin - yPadding, yMax + yPadding])
    .range([innerHeight, 0]);
    
  // X Axis
  const xAxis = d3.axisBottom(xScale);
  if (frequencyScale.value === 'logarithmic') {
    xAxis.ticks(10, (d: any) => {
       const logVal = log10(d);
       if (abs(logVal - Math.round(logVal)) < 1e-6) {
         const power = Math.round(logVal);
         if (power >= 3) return `${pow(10, power - 3)} kHz`;
         return `${d} Hz`;
       }
       return '';
    });
  } else {
    xAxis.tickFormat((d: any) => d >= 1000 ? `${d/1000} kHz` : `${d} Hz`);
  }
  
  const yAxis = d3.axisLeft(yScale);
  
  // Draw Grid Lines (Major)
  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');

  // Draw Minor Grid Lines for Logarithmic Scale (Papel Mono-log)
  if (frequencyScale.value === 'logarithmic') {
    // Generate minor ticks
    const minorTicks = xScale.ticks(); 
    g.append('g')
      .attr('class', 'grid-minor')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale).tickValues(minorTicks).tickSize(-innerHeight).tickFormat(() => ''))
      .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '2,2').style('opacity', '0.3');
  }
    
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');
    
  // Hide grid domains (the solid lines)
  g.selectAll('.grid .domain').style('display', 'none');
  g.selectAll('.grid-minor .domain').style('display', 'none');

  // Draw X Axis
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .style('fill', colors.text)
    .attr('transform', 'rotate(-45)')
    .style('text-anchor', 'end')
    .attr('dx', '-.8em')
    .attr('dy', '.15em');
    
  g.selectAll('.domain').style('stroke', colors.text);
  g.selectAll('.tick line').style('stroke', colors.text);

  // X Axis Label
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .style('text-anchor', 'middle')
    .style('fill', colors.title)
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Frequência (Hz)');
    
  // Draw Y Axis
  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .style('fill', colors.text);
    
  // Y Axis Label
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 15)
    .style('text-anchor', 'middle')
    .style('fill', lineColor)
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text(yLabel);
    
  // Cutoff Line (fc)
  if (showCutoffLine.value && props.cutoffFrequency) {
    if (props.cutoffFrequency >= xScale.domain()[0] && props.cutoffFrequency <= xScale.domain()[1]) {
      const xPixel = xScale(props.cutoffFrequency);
      
      g.append('line')
        .attr('x1', xPixel)
        .attr('y1', 0)
        .attr('x2', xPixel)
        .attr('y2', innerHeight)
        .style('stroke', '#f97316')
        .style('stroke-width', 2)
        .style('stroke-dasharray', '5,5');
        
      const textGroup = g.append('g')
        .attr('transform', `translate(${xPixel}, -10)`);
        
      textGroup.append('rect')
        .attr('x', -35)
        .attr('y', -9)
        .attr('width', 70)
        .attr('height', 18)
        .attr('fill', '#f97316');
        
      let fcText = props.cutoffFrequency.toFixed(1) + ' Hz';
      if (props.cutoffFrequency >= 1000) {
        fcText = (props.cutoffFrequency / 1000).toFixed(2) + ' kHz';
      }
        
      textGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('alignment-baseline', 'middle')
        .style('fill', '#ffffff')
        .style('font-size', '10px')
        .style('font-weight', 'bold')
        .text('fc: ' + fcText);
    }
  }

  // Draw Path (Line)
  const line = d3.line<ExperimentalData>()
    .x(d => xScale(d.freq))
    .y(d => yScale(d[yKey] as number));
    
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', lineColor)
    .attr('stroke-width', 2)
    .attr('d', line);
    
  // Draw Data Points
  if (showDataPoints.value) {
    const symbolMap = {
      'circle': d3.symbolCircle,
      'triangle': d3.symbolTriangle,
      'rect': d3.symbolSquare
    };
    
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('path')
      .attr('class', 'dot')
      .attr('d', d3.symbol().type(symbolMap[pointShape]).size(40))
      .attr('transform', d => `translate(${xScale(d.freq)},${yScale(d[yKey] as number)})`)
      .style('fill', lineColor)
      .style('stroke', colors.lineBorder)
      .style('stroke-width', 1);
  }
  
  // Interactive Crosshair & Tooltip
  const tooltipGroup = g.append('g').style('display', 'none');
  
  tooltipGroup.append('line')
    .attr('class', 'crosshair-x')
    .attr('y1', 0)
    .attr('y2', innerHeight)
    .style('stroke', colors.crosshair)
    .style('stroke-dasharray', '4,4')
    .style('pointer-events', 'none');
    
  const tooltipRect = d3.select('body').append('div')
    .attr('class', 'd3-tooltip')
    .style('position', 'absolute')
    .style('display', 'none')
    .style('background', colors.tooltipBg)
    .style('border', `1px solid ${colors.lineBorder}`)
    .style('border-radius', '4px')
    .style('padding', '8px')
    .style('color', colors.tooltipBody)
    .style('font-size', '12px')
    .style('pointer-events', 'none')
    .style('z-index', '9999')
    .style('box-shadow', '0 4px 6px -1px rgba(0, 0, 0, 0.1)');
    
  const bisectFreq = d3.bisector((d: ExperimentalData) => d.freq).left;
  
  // Invisible rect to capture mouse events over the entire chart area
  g.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .style('fill', 'transparent')
    .style('pointer-events', 'all')
    .on('mouseover', () => {
      tooltipGroup.style('display', null);
      tooltipRect.style('display', 'block');
    })
    .on('mouseout', () => {
      tooltipGroup.style('display', 'none');
      tooltipRect.style('display', 'none');
    })
    .on('mousemove', (event) => {
      const x0 = xScale.invert(d3.pointer(event)[0]);
      let i = bisectFreq(data, x0, 1);
      if (i >= data.length) i = data.length - 1;
      const d0 = data[i - 1];
      const d1 = data[i];
      const d = (d1 && d0) ? (x0 - d0.freq > d1.freq - x0 ? d1 : d0) : (d0 || d1);
      
      if (!d) return;

      const xPixel = xScale(d.freq);
      
      tooltipGroup.select('.crosshair-x')
        .attr('x1', xPixel)
        .attr('x2', xPixel);
        
      let freqText = d.freq >= 1000 ? `${(d.freq/1000).toFixed(2)} kHz` : `${d.freq.toFixed(1)} Hz`;
      
      tooltipRect.html(`
        <strong style="color:${colors.title}">Freq:</strong> ${freqText}<br>
        <strong style="color:${lineColor}">${yLabel}:</strong> ${(d[yKey] as number).toFixed(3)}
      `)
      .style('left', (event.pageX + 15) + 'px')
      .style('top', (event.pageY - 28) + 'px');
    });
}

function updateCharts() {
  const data = props.processedData;
  // Clean up global tooltips
  d3.selectAll('.d3-tooltip').remove();
  
  if (!data || data.length === 0) return;
  
  if (activeTab.value === 'bode-mag' && containerBodeMag.value) {
    drawChart(containerBodeMag.value, data, 'gvLinear', 'Ganho Mag (Linear)', '#38bdf8', 'circle');
  } else if (activeTab.value === 'bode-db' && containerBodeDb.value) {
    drawChart(containerBodeDb.value, data, 'gvDb', 'Ganho Av (dB)', '#10b981', 'triangle');
  } else if (activeTab.value === 'bode-phase' && containerBodePhase.value) {
    drawChart(containerBodePhase.value, data, 'phase', 'Fase (Graus)', '#ef4444', 'rect');
  }
}

const handleThemeChange = () => {
  updateCharts();
};

onMounted(() => {
  window.addEventListener('theme-changed', handleThemeChange);
  
  resizeObserver = new ResizeObserver(() => {
    updateCharts();
  });
  
  if (containerBodeMag.value) resizeObserver.observe(containerBodeMag.value);
  if (containerBodeDb.value) resizeObserver.observe(containerBodeDb.value);
  if (containerBodePhase.value) resizeObserver.observe(containerBodePhase.value);
  
  // Initial draw
  setTimeout(updateCharts, 100);
});

onUnmounted(() => {
  window.removeEventListener('theme-changed', handleThemeChange);
  if (resizeObserver) resizeObserver.disconnect();
  d3.selectAll('.d3-tooltip').remove();
});

watch(() => props.processedData, () => {
  updateCharts();
}, { deep: true });

watch([frequencyScale, showDataPoints, showCutoffLine, () => props.cutoffFrequency, activeTab], () => {
  updateCharts();
});

function toggleScale() {
  frequencyScale.value = frequencyScale.value === 'logarithmic' ? 'linear' : 'logarithmic';
}

function exportChart() {
  let activeContainer: HTMLDivElement | null = null;
  if (activeTab.value === 'bode-mag') activeContainer = containerBodeMag.value;
  else if (activeTab.value === 'bode-db') activeContainer = containerBodeDb.value;
  else if (activeTab.value === 'bode-phase') activeContainer = containerBodePhase.value;

  if (activeContainer) {
    const svgElement = activeContainer.querySelector('svg');
    if (!svgElement) return;

    // Serialize SVG to XML string
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgElement);

    // Add namespace and convert to data URI
    const xml = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);

    // Create Canvas to draw the SVG image
    const canvas = document.createElement('canvas');
    canvas.width = svgElement.clientWidth * 2; // Export at 2x resolution for high quality
    canvas.height = svgElement.clientHeight * 2;
    const ctx = canvas.getContext('2d');
    
    if(!ctx) return;
    
    // Scale context for high-res
    ctx.scale(2, 2);

    const img = new Image();
    img.onload = () => {
      // Draw background explicitly (SVGs are transparent)
      ctx.fillStyle = getThemeColors().bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw SVG Image
      ctx.drawImage(img, 0, 0, svgElement.clientWidth, svgElement.clientHeight);
      
      // Export and Download
      const pngUrl = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `d3_grafico_${activeTab.value}.png`;
      downloadLink.click();
    };
    img.src = url;
  }
}
</script>

<template>
  <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm h-full flex flex-col transition-colors duration-300">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-lg font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
          <span class="inline-block h-3 w-3 rounded bg-indigo-500"></span>
          Painel D3.js (Resposta de Frequência)
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Visualização avançada e responsiva renderizada vetor a vetor com o poder do D3.
        </p>
      </div>
      
      <!-- Tab Controls -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 font-mono text-[10px] uppercase font-bold tracking-wider w-full sm:w-auto transition-colors duration-300">
        <button 
          @click="activeTab = 'bode-mag'"
          type="button" 
          :class="[
            'flex-1 sm:flex-initial px-3 py-2 transition-all cursor-pointer flex items-center justify-center gap-1 border-b-2',
            activeTab === 'bode-mag' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-500' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
          ]"
        >
          <span class="material-symbols-outlined text-[14px]">linear_scale</span>
          Mag (Linear)
        </button>
        <button 
          @click="activeTab = 'bode-db'"
          type="button" 
          :class="[
            'flex-1 sm:flex-initial px-3 py-2 transition-all cursor-pointer flex items-center justify-center gap-1 border-b-2',
            activeTab === 'bode-db' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-500' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
          ]"
        >
          <span class="material-symbols-outlined text-[14px]">graphic_eq</span>
          Ganho (dB)
        </button>
        <button 
          @click="activeTab = 'bode-phase'"
          type="button" 
          :class="[
            'flex-1 sm:flex-initial px-3 py-2 transition-all cursor-pointer flex items-center justify-center gap-1 border-b-2',
            activeTab === 'bode-phase' ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-500' : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700'
          ]"
        >
          <span class="material-symbols-outlined text-[14px]">waves</span>
          Fase
        </button>
      </div>
    </div>

    <!-- Chart Container Area -->
    <div class="flex-1 min-h-[350px] md:min-h-[400px] relative bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md p-4 mb-4 transition-colors duration-300 overflow-hidden">
      
      <!-- Mag Linear Chart Tab -->
      <div v-show="activeTab === 'bode-mag'" class="w-full h-full absolute inset-0 p-4" ref="containerBodeMag"></div>

      <!-- Ganho dB Chart Tab -->
      <div v-show="activeTab === 'bode-db'" class="w-full h-full absolute inset-0 p-4" ref="containerBodeDb"></div>

      <!-- Fase Chart Tab -->
      <div v-show="activeTab === 'bode-phase'" class="w-full h-full absolute inset-0 p-4" ref="containerBodePhase"></div>
    </div>

    <!-- Chart Actions -->
    <div class="flex flex-col sm:flex-row justify-end items-center gap-3">
      <div class="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 font-mono font-bold mr-auto">
        <div class="flex items-center gap-2">
          <span>X:</span>
          <button 
            @click="toggleScale"
            type="button" 
            class="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-slate-300 dark:border-slate-700 px-3 py-1.5 rounded transition-colors cursor-pointer w-24 text-center"
          >
            {{ frequencyScale === 'logarithmic' ? 'Logarítmico' : 'Linear' }}
          </button>
        </div>

        <div class="flex items-center gap-2 border-l border-slate-300 dark:border-slate-700 pl-4">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" v-model="showDataPoints" class="accent-indigo-500 cursor-pointer w-3.5 h-3.5">
            Pontos
          </label>
          <label class="flex items-center gap-1.5 cursor-pointer ml-3">
            <input type="checkbox" v-model="showCutoffLine" class="accent-orange-500 cursor-pointer w-3.5 h-3.5">
            Linha fc
          </label>
        </div>
      </div>
      
      <button 
        @click="exportChart"
        type="button" 
        class="w-full sm:w-auto text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 px-4 py-2.5 rounded shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
      >
        <span class="material-symbols-outlined text-[16px]">photo_camera</span> Exportar SVG (PNG)
      </button>
    </div>
  </div>
</template>
