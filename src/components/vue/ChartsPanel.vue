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
const containerNyquist = ref<HTMLDivElement | null>(null);
const containerNichols = ref<HTMLDivElement | null>(null);

let resizeObserver: ResizeObserver | null = null;

// --- Theme ---
function getThemeColors() {
  const isDark = document.documentElement.classList.contains('dark');
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim();
  return {
    text: get('--text-secondary') || (isDark ? '#94a3b8' : '#334155'), 
    title: get('--text-primary') || (isDark ? '#e2e8f0' : '#0f172a'),
    grid: isDark ? 'rgba(51, 65, 85, 0.2)' : 'rgba(148, 163, 184, 0.4)',
    tooltipBg: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipTitle: get('--text-primary') || (isDark ? '#f8fafc' : '#0f172a'),
    tooltipBody: get('--text-secondary') || (isDark ? '#cbd5e1' : '#334155'),
    crosshair: isDark ? 'rgba(148, 163, 184, 0.4)' : 'rgba(51, 65, 85, 0.6)', 
    lineBorder: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.8)',
    bg: get('--surface-inset') || (isDark ? '#020617' : '#f8fafc')
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
    if (props.cutoffFrequency > 0) {
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

function drawNyquist(container: HTMLDivElement | null, rawData: ExperimentalData[]) {
  if (!container || rawData.length === 0) return;
  const data = rawData.filter(d => d.phase !== null && d.phase !== undefined && !isNaN(d.phase) && d.gvLinear !== null && d.gvLinear !== undefined && !isNaN(d.gvLinear));
  if (data.length === 0) {
    d3.select(container).selectAll('*').remove();
    return;
  }
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
    
  const nyData = data.map(d => {
    const rad = ((d.phase || 0) * Math.PI) / 180;
    return {
      freq: d.freq,
      re: (d.gvLinear || 0) * Math.cos(rad),
      im: (d.gvLinear || 0) * Math.sin(rad)
    };
  });
  
  const reMin = d3.min(nyData, d => d.re) as number;
  const reMax = d3.max(nyData, d => d.re) as number;
  const imMin = d3.min(nyData, d => d.im) as number;
  const imMax = d3.max(nyData, d => d.im) as number;
  
  const rePadding = (reMax - reMin) * 0.1 || 0.1;
  const imPadding = (imMax - imMin) * 0.1 || 0.1;
  
  const xScale = d3.scaleLinear()
    .domain([reMin - rePadding, reMax + rePadding])
    .range([0, innerWidth]);
    
  const yScale = d3.scaleLinear()
    .domain([imMin - imPadding, imMax + imPadding])
    .range([innerHeight, 0]);
    
  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3.axisLeft(yScale);
  
  // Grid Lines
  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');
    
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');
    
  g.selectAll('.grid .domain').style('display', 'none');
  
  // Quadrant references at Re=0 and Im=0
  if (xScale.domain()[0] <= 0 && xScale.domain()[1] >= 0) {
    const xZero = xScale(0);
    g.append('line')
      .attr('x1', xZero)
      .attr('y1', 0)
      .attr('x2', xZero)
      .attr('y2', innerHeight)
      .style('stroke', '#a855f7')
      .style('stroke-dasharray', '2,2')
      .style('opacity', 0.5);
  }
  if (yScale.domain()[0] <= 0 && yScale.domain()[1] >= 0) {
    const yZero = yScale(0);
    g.append('line')
      .attr('x1', 0)
      .attr('y1', yZero)
      .attr('x2', innerWidth)
      .attr('y2', yZero)
      .style('stroke', '#a855f7')
      .style('stroke-dasharray', '2,2')
      .style('opacity', 0.5);
  }
  
  // Draw Axes
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .style('fill', colors.text);
    
  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .style('fill', colors.text);
    
  g.selectAll('.domain').style('stroke', colors.text);
  g.selectAll('.tick line').style('stroke', colors.text);
  
  // Labels
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .style('text-anchor', 'middle')
    .style('fill', colors.title)
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Re(H) - Parte Real');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 15)
    .style('text-anchor', 'middle')
    .style('fill', '#a855f7')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Im(H) - Parte Imaginária');
    
  // Draw Path (Line)
  const line = d3.line<any>()
    .x(d => xScale(d.re))
    .y(d => yScale(d.im));
    
  g.append('path')
    .datum(nyData)
    .attr('fill', 'none')
    .attr('stroke', '#a855f7')
    .attr('stroke-width', 2)
    .attr('d', line);
    
  // Draw Points
  if (showDataPoints.value) {
    g.selectAll('.dot')
      .data(nyData)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.re))
      .attr('cy', d => yScale(d.im))
      .attr('r', 4)
      .style('fill', '#a855f7')
      .style('stroke', colors.lineBorder)
      .style('stroke-width', 1);
  }
  
  // Tooltips
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
      const coords = d3.pointer(event);
      let minDistance = Infinity;
      let closestPoint = nyData[0];
      
      nyData.forEach(p => {
        const dist = Math.sqrt(Math.pow(xScale(p.re) - coords[0], 2) + Math.pow(yScale(p.im) - coords[1], 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestPoint = p;
        }
      });
      
      if (!closestPoint) return;
      const xPixel = xScale(closestPoint.re);
      
      tooltipGroup.select('.crosshair-x')
        .attr('x1', xPixel)
        .attr('x2', xPixel);
        
      let freqText = closestPoint.freq >= 1000 ? `${(closestPoint.freq/1000).toFixed(2)} kHz` : `${closestPoint.freq.toFixed(1)} Hz`;
      
      tooltipRect.html(`
        <strong style="color:${colors.title}">Freq:</strong> ${freqText}<br>
        <strong style="color:#a855f7">Re(H):</strong> ${closestPoint.re.toFixed(4)}<br>
        <strong style="color:#a855f7">Im(H):</strong> ${closestPoint.im.toFixed(4)}
      `)
      .style('left', (event.pageX + 15) + 'px')
      .style('top', (event.pageY - 28) + 'px');
    });
}

function drawNichols(container: HTMLDivElement | null, rawData: ExperimentalData[]) {
  if (!container || rawData.length === 0) return;
  const data = rawData.filter(d => d.phase !== null && d.phase !== undefined && !isNaN(d.phase) && d.gvDb !== null && d.gvDb !== undefined && !isNaN(d.gvDb));
  if (data.length === 0) {
    d3.select(container).selectAll('*').remove();
    return;
  }
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
    
  const phaseMin = d3.min(data, d => d.phase as number) as number;
  const phaseMax = d3.max(data, d => d.phase as number) as number;
  const dbMin = d3.min(data, d => d.gvDb as number) as number;
  const dbMax = d3.max(data, d => d.gvDb as number) as number;
  
  const phasePadding = (phaseMax - phaseMin) * 0.1 || 10;
  const dbPadding = (dbMax - dbMin) * 0.1 || 3;
  
  const xScale = d3.scaleLinear()
    .domain([phaseMin - phasePadding, phaseMax + phasePadding])
    .range([0, innerWidth]);
    
  const yScale = d3.scaleLinear()
    .domain([dbMin - dbPadding, dbMax + dbPadding])
    .range([innerHeight, 0]);
    
  const xAxis = d3.axisBottom(xScale).tickFormat((d: any) => `${d}°`);
  const yAxis = d3.axisLeft(yScale).tickFormat((d: any) => `${d} dB`);
  
  // Grid Lines
  g.append('g')
    .attr('class', 'grid')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');
    
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(() => ''))
    .selectAll('line').style('stroke', colors.grid).style('stroke-dasharray', '4,4');
    
  g.selectAll('.grid .domain').style('display', 'none');
  
  // Draw Axes
  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .style('fill', colors.text);
    
  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .style('fill', colors.text);
    
  g.selectAll('.domain').style('stroke', colors.text);
  g.selectAll('.tick line').style('stroke', colors.text);
  
  // Labels
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .style('text-anchor', 'middle')
    .style('fill', colors.title)
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Fase θ (Graus)');
    
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 15)
    .style('text-anchor', 'middle')
    .style('fill', '#eab308')
    .style('font-size', '12px')
    .style('font-weight', 'bold')
    .text('Ganho Av (dB)');
    
  // Draw Path (Line)
  const line = d3.line<ExperimentalData>()
    .x(d => xScale(d.phase as number))
    .y(d => yScale(d.gvDb as number));
    
  g.append('path')
    .datum(data)
    .attr('fill', 'none')
    .attr('stroke', '#eab308')
    .attr('stroke-width', 2)
    .attr('d', line);
    
  // Draw Points
  if (showDataPoints.value) {
    g.selectAll('.dot')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'dot')
      .attr('x', d => xScale(d.phase as number) - 3)
      .attr('y', d => yScale(d.gvDb as number) - 3)
      .attr('width', 6)
      .attr('height', 6)
      .style('fill', '#eab308')
      .style('stroke', colors.lineBorder)
      .style('stroke-width', 1);
  }
  
  // Tooltips
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
      const coords = d3.pointer(event);
      let minDistance = Infinity;
      let closestPoint = data[0];
      
      data.forEach(p => {
        const dist = Math.sqrt(Math.pow(xScale(p.phase as number) - coords[0], 2) + Math.pow(yScale(p.gvDb as number) - coords[1], 2));
        if (dist < minDistance) {
          minDistance = dist;
          closestPoint = p;
        }
      });
      
      if (!closestPoint) return;
      const xPixel = xScale(closestPoint.phase as number);
      
      tooltipGroup.select('.crosshair-x')
        .attr('x1', xPixel)
        .attr('x2', xPixel);
        
      let freqText = closestPoint.freq >= 1000 ? `${(closestPoint.freq/1000).toFixed(2)} kHz` : `${closestPoint.freq.toFixed(1)} Hz`;
      
      tooltipRect.html(`
        <strong style="color:${colors.title}">Freq:</strong> ${freqText}<br>
        <strong style="color:#eab308">Fase θ:</strong> ${(closestPoint.phase || 0).toFixed(1)}°<br>
        <strong style="color:#eab308">Ganho Av:</strong> ${(closestPoint.gvDb || 0).toFixed(2)} dB
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
  } else if (activeTab.value === 'nyquist' && containerNyquist.value) {
    drawNyquist(containerNyquist.value, data);
  } else if (activeTab.value === 'nichols' && containerNichols.value) {
    drawNichols(containerNichols.value, data);
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
  if (containerNyquist.value) resizeObserver.observe(containerNyquist.value);
  if (containerNichols.value) resizeObserver.observe(containerNichols.value);
  
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
  else if (activeTab.value === 'nyquist') activeContainer = containerNyquist.value;
  else if (activeTab.value === 'nichols') activeContainer = containerNichols.value;

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
  <div class="cb-card p-5 h-full flex flex-col">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <div class="cb-card-header">
          <span class="accent-dot"></span>
          <h2>Painel D3.js (Resposta de Frequência)</h2>
        </div>
        <p class="cb-subtitle" style="margin-left:18px">
          Visualização avançada e responsiva renderizada vetor a vetor com o poder do D3.
        </p>
      </div>
      
      <!-- Tab Controls -->
      <div class="flex font-mono text-[10px] uppercase font-bold tracking-wider w-full sm:w-auto overflow-x-auto" style="border-bottom:1px solid var(--border-default)">
        <button 
          @click="activeTab = 'bode-mag'"
          type="button" 
          :class="['cb-tab', activeTab === 'bode-mag' ? 'cb-tab-active' : '']"
        >
          <span class="material-symbols-outlined text-[14px]">linear_scale</span>
          Mag (Linear)
        </button>
        <button 
          @click="activeTab = 'bode-db'"
          type="button" 
          :class="['cb-tab', activeTab === 'bode-db' ? 'cb-tab-active' : '']"
        >
          <span class="material-symbols-outlined text-[14px]">graphic_eq</span>
          Ganho (dB)
        </button>
        <button 
          @click="activeTab = 'bode-phase'"
          type="button" 
          :class="['cb-tab', activeTab === 'bode-phase' ? 'cb-tab-active' : '']"
        >
          <span class="material-symbols-outlined text-[14px]">waves</span>
          Fase
        </button>
        <button 
          @click="activeTab = 'nyquist'"
          type="button" 
          :class="['cb-tab', activeTab === 'nyquist' ? 'cb-tab-active' : '']"
        >
          <span class="material-symbols-outlined text-[14px]">scatter_plot</span>
          Nyquist
        </button>
        <button 
          @click="activeTab = 'nichols'"
          type="button" 
          :class="['cb-tab', activeTab === 'nichols' ? 'cb-tab-active' : '']"
        >
          <span class="material-symbols-outlined text-[14px]">show_chart</span>
          Nichols
        </button>
      </div>
    </div>

    <!-- Chart Container Area -->
    <div class="cb-inset flex-1 min-h-[350px] md:min-h-[400px] relative p-4 mb-4 overflow-hidden">
      
      <!-- Mag Linear Chart Tab -->
      <div v-show="activeTab === 'bode-mag'" class="w-full h-full absolute inset-0 p-4" ref="containerBodeMag"></div>

      <!-- Ganho dB Chart Tab -->
      <div v-show="activeTab === 'bode-db'" class="w-full h-full absolute inset-0 p-4" ref="containerBodeDb"></div>

      <!-- Fase Chart Tab -->
      <div v-show="activeTab === 'bode-phase'" class="w-full h-full absolute inset-0 p-4" ref="containerBodePhase"></div>

      <!-- Nyquist Chart Tab -->
      <div v-show="activeTab === 'nyquist'" class="w-full h-full absolute inset-0 p-4" ref="containerNyquist"></div>

      <!-- Nichols Chart Tab -->
      <div v-show="activeTab === 'nichols'" class="w-full h-full absolute inset-0 p-4" ref="containerNichols"></div>
    </div>

    <!-- Chart Actions -->
    <div class="flex flex-col sm:flex-row justify-end items-center gap-3">
      <div class="flex items-center gap-4 text-xs font-mono font-bold mr-auto" style="color:var(--text-tertiary)">
        <!-- Scale Selector only for Bode Plots -->
        <div v-if="activeTab.startsWith('bode')" class="flex items-center gap-2">
          <span>Escala Freq (X):</span>
          <button 
            @click="toggleScale"
            type="button" 
            class="cb-btn-outline px-3 py-1.5 w-24 text-center"
          >
            {{ frequencyScale === 'logarithmic' ? 'Logarítmico' : 'Linear' }}
          </button>
        </div>
        
        <!-- Helpful Information for Nyquist -->
        <div v-else-if="activeTab === 'nyquist'" class="flex items-center gap-1.5 px-2.5 py-1 rounded" style="color:var(--primary-text);background:var(--primary-surface);border:1px solid var(--primary-border)">
          <span class="material-symbols-outlined text-[15px]">info</span>
          <span class="font-sans text-[10px] uppercase font-bold tracking-wider">Eixos Lineares (Plano Complexo Re vs Im)</span>
        </div>
        
        <!-- Helpful Information for Nichols -->
        <div v-else-if="activeTab === 'nichols'" class="flex items-center gap-1.5 px-2.5 py-1 rounded" style="color:var(--primary-text);background:var(--primary-surface);border:1px solid var(--primary-border)">
          <span class="material-symbols-outlined text-[15px]">info</span>
          <span class="font-sans text-[10px] uppercase font-bold tracking-wider">Eixos Lineares (Ganho dB vs Fase Grau)</span>
        </div>

        <div :class="[activeTab.startsWith('bode') ? 'pl-4' : '', 'flex items-center gap-2']" :style="activeTab.startsWith('bode') ? 'border-left:1px solid var(--border-default)' : ''">
          <label class="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" v-model="showDataPoints" class="cursor-pointer w-3.5 h-3.5" style="accent-color:var(--primary)">
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
        class="cb-btn-outline w-full sm:w-auto flex items-center justify-center gap-1.5"
      >
        <span class="material-symbols-outlined text-[16px]">photo_camera</span> Exportar SVG (PNG)
      </button>
    </div>
  </div>
</template>
