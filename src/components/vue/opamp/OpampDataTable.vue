<script setup lang="ts">
import { ref, computed } from 'vue';
import type { OpampDataPoint } from '../../../utils/mathUtilsOpamp';
import { parseEngineeringValue, formatForInput } from '../../../utils/mathUtilsOpamp';
import OpampSourceVoltageInput from './OpampSourceVoltageInput.vue';
import OpampCalibrationControl from './OpampCalibrationControl.vue';
import OpampDecadeGenerator from './OpampDecadeGenerator.vue';

function generateDecades(startFreq: number, decades: number, ptsPerDecade: number): number[] {
  const freqs: number[] = [];
  for (let i = 0; i <= decades * ptsPerDecade; i++) {
    const freq = startFreq * Math.pow(10, i / ptsPerDecade);
    freqs.push(freq);
  }
  return freqs;
}

const props = defineProps<{
  experimentalData: OpampDataPoint[];
  processedData: OpampDataPoint[];
  closestToCutoffId: string | null;
  maxGvDb: number;
  globalVinPp: number;
  globalVinUnit?: string;
  globalVoutUnit?: string;
}>();

const emit = defineEmits<{
  (e: 'updateData', data: OpampDataPoint[]): void;
  (e: 'removePoint', id: string): void;
  (e: 'clearData'): void;
  (e: 'updateVinPp', value: number): void;
  (e: 'updateVinUnit', value: string): void;
  (e: 'updateVoutUnit', value: string): void;
  (e: 'exportCsv'): void;
  (e: 'importCsv', text: string): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function triggerFileInput() {
  fileInput.value?.click();
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    emit('importCsv', text);
    target.value = ''; // Reset
  };
  reader.readAsText(file);
}

const getProcessedRow = (id: string) => {
  return props.processedData.find(p => p.id === id) || { vppOut: NaN, gvLinear: NaN, gvDb: NaN, phase: null, isInterpolated: false };
};

const showGenerator = ref(false);

const onInputChange = (event: Event, row: OpampDataPoint, field: keyof OpampDataPoint) => {
  const target = event.target as HTMLInputElement;
  const valueStr = target.value.trim().replace(',', '.');
  
  const newData = [...props.experimentalData];
  const rowIndex = newData.findIndex(r => r.id === row.id);
  
  if (valueStr === '') {
    if (field === 'phase' || field === 'vMax' || field === 'vMin') {
      newData[rowIndex] = { ...newData[rowIndex], [field]: null };
    }
  } else {
    const num = parseEngineeringValue(valueStr);
    if (!isNaN(num)) {
      newData[rowIndex] = { ...newData[rowIndex], [field]: num };
    }
  }
  emit('updateData', newData);
};

const handleKeydown = (event: KeyboardEvent, id: string, field: keyof OpampDataPoint) => {
  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const target = event.target as HTMLInputElement;
    target.blur();

    const currentIndex = props.experimentalData.findIndex(r => r.id === id);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      nextIndex = currentIndex + 1;
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex - 1;
    }

    if (nextIndex >= 0 && nextIndex < props.experimentalData.length) {
      setTimeout(() => {
        const nextInput = document.querySelector(`input[data-field="${field}"][value="${props.experimentalData[nextIndex][field] !== null ? props.experimentalData[nextIndex][field] : ''}"]`) as HTMLInputElement;
        if (nextInput) nextInput.focus();
        else {
          const allInputs = document.querySelectorAll(`input[data-field="${field}"]`);
          if (allInputs[nextIndex]) (allInputs[nextIndex] as HTMLInputElement).focus();
        }
      }, 50);
    }
  }
};

const handleDecadeGenerator = (start: number, end: number, points: number) => {
  const decades = Math.log10(end / start);
  if (isNaN(decades) || decades <= 0 || start <= 0 || points <= 0) {
    alert("Valores inválidos fornecidos.");
    return;
  }

  const generatedFreqs = generateDecades(start, decades, points);
  
  const newData = [...props.experimentalData];
  for (const freq of generatedFreqs) {
    if (!newData.some(p => Math.abs(p.freq - freq) < 0.001)) {
      newData.push({
        id: Math.random().toString(36).substring(2, 9),
        freq: parseFloat(freq.toFixed(2)),
        vMax: null,
        vMin: null,
        phase: null
      });
    }
  }
  
  newData.sort((a, b) => a.freq - b.freq);
  emit('updateData', newData);
  showGenerator.value = false;
};

const applyCalibration = (factor: number) => {
  if (isNaN(factor) || factor <= 0) return;
  
  const newData = props.experimentalData.map(p => ({
    ...p,
    vMax: p.vMax !== null ? p.vMax * factor : null,
    vMin: p.vMin !== null ? p.vMin * factor : null
  }));
  emit('updateData', newData);
};
</script>

<template>
  <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition-colors duration-300">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-lg font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
          <span class="inline-block h-3 w-3 rounded bg-emerald-500"></span>
          Dados do Experimento Prático (Filtros Ativos)
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Insira os dados lidos do gerador de sinais e osciloscópio (Vmax e Vmin) para plotagem automática.
        </p>
      </div>

      <OpampSourceVoltageInput 
        :value="globalVinPp"
        :unit="globalVinUnit || 'V'"
        label="Vin(pp)"
        @update:value="(val) => emit('updateVinPp', val)"
        @update:unit="(unit) => emit('updateVinUnit', unit)"
      />

      <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
        <button 
          @click="emit('clearData')" 
          v-if="experimentalData.length > 0"
          type="button" 
          class="flex-1 sm:flex-initial text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-3 py-1.5 rounded transition-all font-sans"
        >
          Limpar Tudo
        </button>
      </div>
    </div>

    <!-- Responsive Table -->
    <div class="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-md bg-white dark:bg-slate-950 transition-colors duration-300">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-[10px] tracking-wider uppercase transition-colors duration-300">
            <th class="py-3 px-4">Freq (Hz)</th>
            <th class="py-3 px-4 transition-colors">
              <div class="flex items-center gap-1.5">
                <span>Vmax</span>
                <select :value="globalVoutUnit || 'V'" @change="(e) => emit('updateVoutUnit', (e.target as HTMLSelectElement).value)" class="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[9px] px-1 py-0.5 rounded cursor-pointer outline-none hover:border-slate-400 dark:hover:border-slate-500 transition-colors appearance-none text-center font-bold">
                  <option value="V">V</option>
                  <option value="mV">mV</option>
                  <option value="uV">µV</option>
                </select>
              </div>
            </th>
            <th class="py-3 px-4">
              <div class="flex items-center gap-1.5">
                <span>Vmin</span>
                <span class="text-[9px] px-1 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-500 font-bold opacity-70">{{ globalVoutUnit || 'V' }}</span>
              </div>
            </th>
            <th class="py-3 px-4 text-center">Vout,pp</th>
            <th class="py-3 px-4 text-center">Gv (Lin)</th>
            <th class="py-3 px-4 text-center">Av (dB)</th>
            <th class="py-3 px-4 text-center">Fase θ (°)</th>
            <th class="py-3 px-4 text-center w-16">Ação</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-slate-100 dark:divide-slate-850/60 font-mono">
          <tr v-if="experimentalData.length === 0">
            <td colspan="8" class="py-12 text-center">
              <div class="flex flex-col items-center justify-center gap-3 opacity-60">
                <span class="material-symbols-outlined text-5xl text-slate-600">query_stats</span>
                <p class="font-sans text-sm text-slate-400 font-medium">Nenhum dado experimental inserido.</p>
                <p class="font-sans text-xs text-slate-500 max-w-sm">Adicione um ponto para visualizar os gráficos de Bode.</p>
              </div>
            </td>
          </tr>
          
          <tr 
            v-for="row in experimentalData" 
            :key="row.id"
            :class="[
              (!isNaN(getProcessedRow(row.id).gvDb as number) && getProcessedRow(row.id).gvDb === maxGvDb && processedData.length > 1) ? 'bg-indigo-50/30 dark:bg-indigo-900/10 hover:bg-slate-100 dark:hover:bg-slate-900/40' : 
              (closestToCutoffId === row.id) ? 'bg-orange-50/50 dark:bg-orange-900/20 hover:bg-slate-100 dark:hover:bg-slate-900/40' : 'hover:bg-slate-100 dark:hover:bg-slate-900/40',
              'border-b border-slate-200 dark:border-slate-900/50 transition-colors'
            ]"
          >
            <!-- Freq -->
            <td class="py-2.5 px-4 relative">
              <span v-if="closestToCutoffId === row.id" class="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-orange-500 rounded-r" title="Frequência mais próxima do Corte (-3dB)"></span>
              <div class="flex items-center gap-1.5">
                <span v-if="closestToCutoffId === row.id" class="material-symbols-outlined text-[14px] text-orange-500" title="Próximo de fc">filter_alt</span>
                <input 
                  type="text" 
                  data-field="freq" 
                  :value="formatForInput(row.freq)" 
                  @change="e => onInputChange(e, row, 'freq')"
                  @keydown="e => handleKeydown(e, row.id, 'freq')"
                  :class="[
                    closestToCutoffId === row.id ? 'border-orange-300 dark:border-orange-500/50 focus:border-orange-500 focus:ring-orange-500 bg-orange-50/50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100',
                    'w-full rounded px-2 py-1 focus:ring-1 focus:outline-none font-mono text-xs transition-colors'
                  ]"
                />
              </div>
            </td>
            <!-- Vmax -->
            <td class="py-2.5 px-4">
              <input 
                type="text" 
                data-field="vMax" 
                :value="formatForInput(row.vMax)" 
                @change="e => onInputChange(e, row, 'vMax')"
                @keydown="e => handleKeydown(e, row.id, 'vMax')"
                class="w-full rounded px-2 focus:ring-1 py-1 focus:outline-none font-mono text-xs transition-colors border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200"
              />
            </td>
            <!-- Vmin -->
            <td class="py-2.5 px-4">
              <input 
                type="text" 
                data-field="vMin" 
                :value="formatForInput(row.vMin)" 
                @change="e => onInputChange(e, row, 'vMin')"
                @keydown="e => handleKeydown(e, row.id, 'vMin')"
                class="w-full rounded px-2 focus:ring-1 py-1 focus:outline-none font-mono text-xs transition-colors border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200"
              />
            </td>
            <!-- Vout,pp -->
            <td class="py-2.5 px-4 text-center text-slate-600 dark:text-slate-300 font-mono text-xs">
              {{ isNaN(getProcessedRow(row.id).vppOut as number) ? "N/A" : (getProcessedRow(row.id).vppOut as number).toFixed(3) }}
            </td>
            <!-- Gv -->
            <td class="py-2.5 px-4 text-center text-slate-600 dark:text-slate-300 font-mono text-xs">
              {{ isNaN(getProcessedRow(row.id).gvLinear as number) ? "N/A" : (getProcessedRow(row.id).gvLinear as number).toFixed(4) }}
            </td>
            <!-- Av(dB) -->
            <td class="py-2.5 px-4 text-center text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold whitespace-nowrap">
              <span v-if="(!isNaN(getProcessedRow(row.id).gvDb as number) && getProcessedRow(row.id).gvDb === maxGvDb && processedData.length > 1)" class="material-symbols-outlined text-[14px] text-amber-500 align-text-bottom mr-1" title="Pico de Ganho">star</span>
              {{ isNaN(getProcessedRow(row.id).gvDb as number) ? "N/A" : `${(getProcessedRow(row.id).gvDb as number).toFixed(2)}` }}
            </td>
            <!-- Phase -->
            <td class="py-2.5 px-4">
              <input 
                type="text" 
                data-field="phase" 
                :value="row.phase !== null ? formatForInput(row.phase) : ''" 
                @change="e => onInputChange(e, row, 'phase')"
                @keydown="e => handleKeydown(e, row.id, 'phase')"
                :placeholder="getProcessedRow(row.id).isInterpolated ? `Auto: ${(getProcessedRow(row.id).phase || 0).toFixed(1)}°` : 'Fase (°)'" 
                :class="[
                  'w-full bg-slate-50 dark:bg-slate-900/50 border hover:border-slate-300 dark:hover:border-slate-600 rounded px-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-1 focus:outline-none font-mono text-xs transition-colors',
                  getProcessedRow(row.id).isInterpolated ? 'border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 placeholder:text-indigo-400 dark:placeholder:text-indigo-500' : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
                ]"
                :title="getProcessedRow(row.id).isInterpolated ? 'Valor calculado automaticamente. Digite para substituir.' : ''"
              />
            </td>
            <!-- Action -->
            <td class="py-2.5 px-4 text-center whitespace-nowrap">
              <button @click="emit('removePoint', row.id)" type="button" class="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent" title="Excluir ponto">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </td>
          </tr>
        </TransitionGroup>
      </table>
    </div>

    <!-- Table Actions -->
    <div class="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4">
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button 
          @click="emit('updateData', [...experimentalData, { id: Math.random().toString(36).substring(2, 9), freq: 0, vMax: null, vMin: null, phase: null }])"
          type="button" 
          class="w-full sm:w-auto text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded shadow-sm flex items-center justify-center gap-1 transition-all"
        >
          <span class="material-symbols-outlined text-[16px]">add</span> Adicionar Ponto
        </button>
        <button 
          @click="showGenerator = !showGenerator"
          type="button" 
          class="w-full sm:w-auto text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 px-4 py-2 rounded shadow-sm flex items-center justify-center gap-1 transition-all"
        >
          <span class="material-symbols-outlined text-[16px]">auto_fix_high</span> Gerar Décadas
        </button>
      </div>
      
      <div class="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
        <OpampCalibrationControl @apply="applyCalibration" />

        <button 
          @click="triggerFileInput"
          type="button" 
          class="w-full sm:w-auto text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 px-4 py-2 rounded flex items-center justify-center gap-1 transition-all"
        >
          <span class="material-symbols-outlined text-[16px]">upload_file</span> Importar CSV
        </button>
        <input 
          type="file" 
          ref="fileInput" 
          @change="onFileChange" 
          accept=".csv" 
          class="hidden" 
        />

        <button 
          @click="emit('exportCsv')"
          type="button" 
          class="w-full sm:w-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-4 py-2 rounded flex items-center justify-center gap-1 transition-all"
        >
          <span class="material-symbols-outlined text-[16px]">save</span> Exportar (CSV)
        </button>
      </div>
    </div>
    
    <!-- Generator Panel -->
    <OpampDecadeGenerator 
      v-if="showGenerator" 
      @generate="handleDecadeGenerator"
      @cancel="showGenerator = false"
    />
  </div>
</template>


<style scoped>
.list-move,
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}
.list-leave-active {
  position: absolute;
}
</style>
