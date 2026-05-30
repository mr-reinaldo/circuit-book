<script setup lang="ts">
import { ref, computed } from 'vue';
import type { OpampDataPoint } from '../../../utils/mathUtilsOpamp';
import { parseEngineeringValue, formatForInput } from '../../../utils/mathUtilsOpamp';
import CalibrationControl from '../sub/CalibrationControl.vue';
import DecadeGenerator from '../sub/DecadeGenerator.vue';
import SignalGeneratorInput from '../sub/SignalGeneratorInput.vue';

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
  amplitudeMode: 'vpp' | 'vrms';
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
  (e: 'updateAmplitudeMode', mode: 'vpp' | 'vrms'): void;
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
    window.dispatchEvent(new CustomEvent('show-toast', { 
      detail: { message: "Frequências ou parâmetros inválidos para a geração de décadas.", type: "error" } 
    }));
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
  <div class="cb-card p-5">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-lg font-bold tracking-tight flex items-center gap-2" style="color:var(--text-primary)">
          <span class="inline-block h-3 w-3 rounded" style="background:var(--primary)"></span>
          Dados do Experimento Prático (Filtros Ativos)
        </h2>
        <p class="text-xs mt-1" style="color:var(--text-secondary)">
          Insira os dados lidos do gerador de sinais e osciloscópio (Vmax e Vmin) para plotagem automática.
        </p>
      </div>

      <SignalGeneratorInput 
        :value="globalVinPp"
        :unit="globalVinUnit || 'V'"
        label="Vin"
        :amplitude-mode="amplitudeMode"
        storage-key="bench-generator-opamp"
        @update:value="(val) => emit('updateVinPp', val)"
        @update:unit="(unit) => emit('updateVinUnit', unit)"
        @update:amplitude-mode="(mode) => emit('updateAmplitudeMode', mode)"
      />

      <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
        <button 
          @click="emit('clearData')" 
          v-if="experimentalData.length > 0"
          type="button" 
          class="flex-1 sm:flex-initial text-[11px] font-semibold px-3 py-1.5 rounded transition-all font-sans cursor-pointer"
          style="background:var(--error-surface);color:var(--error-text);border:1px solid rgba(239,68,68,0.2)"
        >
          Limpar Tudo
        </button>
      </div>
    </div>

    <!-- Responsive Table -->
    <div class="overflow-x-auto rounded-md transition-colors duration-300" style="background:var(--surface-card);border:1px solid var(--border-default)">
      <table class="w-full text-left border-collapse text-xs">
        <thead>
          <tr class="font-mono text-[10px] tracking-wider uppercase transition-colors duration-300" style="background:var(--surface-inset);border-bottom:1px solid var(--border-default);color:var(--text-secondary)">
            <th class="py-3 px-4">Freq (Hz)</th>
            <th class="py-3 px-4 transition-colors">
              <div class="flex items-center gap-1.5">
                <span title="Pico positivo no osciloscópio">V+ (Max)</span>
                <select 
                  :value="globalVoutUnit || 'V'" 
                  @change="(e) => emit('updateVoutUnit', (e.target as HTMLSelectElement).value)" 
                  class="cb-select-unit" 
                  style="border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 10px; padding-top: 2px; padding-bottom: 2px;"
                >
                  <option value="V">V</option>
                  <option value="mV">mV</option>
                  <option value="uV">µV</option>
                </select>
              </div>
            </th>
            <th class="py-3 px-4">
              <div class="flex items-center gap-1.5">
                <span title="Pico negativo no osciloscópio">V- (Min)</span>
                <span class="text-[9px] px-1 py-0.5 rounded font-bold opacity-70" style="background:var(--surface-input);border:1px solid var(--border-default);color:var(--text-secondary)">{{ globalVoutUnit || 'V' }}</span>
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
                <span class="material-symbols-outlined text-5xl" style="color:var(--text-tertiary)">query_stats</span>
                <p class="font-sans text-sm font-medium" style="color:var(--text-tertiary)">Nenhum dado experimental inserido.</p>
                <p class="font-sans text-xs max-w-sm" style="color:var(--text-tertiary)">Adicione um ponto para visualizar os gráficos de Bode.</p>
              </div>
            </td>
          </tr>
          
          <tr 
            v-for="row in experimentalData" 
            :key="row.id"
            :class="[
              (closestToCutoffId === row.id) ? '' : '',
              'transition-colors'
            ]"
            :style="(!isNaN(getProcessedRow(row.id).gvDb as number) && getProcessedRow(row.id).gvDb === maxGvDb && processedData.length > 1) ? 'background:var(--primary-surface);border-bottom:1px solid var(--border-subtle)' : (closestToCutoffId === row.id) ? 'background:var(--warning-surface);border-bottom:1px solid var(--border-subtle)' : 'border-bottom:1px solid var(--border-subtle)'"
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
                  class="cb-input text-xs py-1 px-2"
                  :style="closestToCutoffId === row.id ? 'border-color:var(--warning);color:var(--warning-text)' : ''"
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
                class="cb-input text-xs py-1 px-2"
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
                class="cb-input text-xs py-1 px-2"
              />
            </td>
            <!-- Vout,pp -->
            <td class="py-2.5 px-4 text-center font-mono text-xs" style="color:var(--text-secondary)">
              {{ isNaN(getProcessedRow(row.id).vppOut as number) ? "N/A" : (getProcessedRow(row.id).vppOut as number).toFixed(3) }}
            </td>
            <!-- Gv -->
            <td class="py-2.5 px-4 text-center font-mono text-xs" style="color:var(--text-secondary)">
              {{ isNaN(getProcessedRow(row.id).gvLinear as number) ? "N/A" : (getProcessedRow(row.id).gvLinear as number).toFixed(4) }}
            </td>
            <!-- Av(dB) -->
            <td class="py-2.5 px-4 text-center font-mono text-xs font-bold whitespace-nowrap" style="color:var(--success-text)">
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
                class="cb-input text-xs py-1 px-2"
                :style="getProcessedRow(row.id).isInterpolated ? 'border-color:var(--primary-border);color:var(--primary-text)' : ''"
                :title="getProcessedRow(row.id).isInterpolated ? 'Valor calculado automaticamente. Digite para substituir.' : ''"
              />
            </td>
            <!-- Action -->
            <td class="py-2.5 px-4 text-center whitespace-nowrap">
              <button @click="emit('removePoint', row.id)" type="button" class="transition-colors p-1 rounded border border-transparent cursor-pointer" style="color:var(--error-text)" title="Excluir ponto">
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
          class="cb-btn w-full sm:w-auto flex items-center justify-center gap-1"
        >
          <span class="material-symbols-outlined text-[16px]">add</span> Adicionar Ponto
        </button>
        <button 
          @click="showGenerator = !showGenerator"
          type="button" 
          class="cb-btn-outline w-full sm:w-auto flex items-center justify-center gap-1"
        >
          <span class="material-symbols-outlined text-[16px]">auto_fix_high</span> Gerar Décadas
        </button>
      </div>
      
      <div class="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
        <CalibrationControl label="Calibrar Vm" @apply="applyCalibration" />

        <button 
          @click="triggerFileInput"
          type="button" 
          class="cb-btn-outline w-full sm:w-auto flex items-center justify-center gap-1"
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
          class="w-full sm:w-auto text-xs font-bold px-4 py-2 rounded flex items-center justify-center gap-1 transition-all cursor-pointer font-sans"
          style="background:var(--success-surface);color:var(--success-text);border:1px solid rgba(16,185,129,0.2)"
        >
          <span class="material-symbols-outlined text-[16px]">save</span> Exportar (CSV)
        </button>
      </div>
    </div>
    
    <!-- Generator Panel -->
    <DecadeGenerator 
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
