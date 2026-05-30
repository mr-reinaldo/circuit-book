<script setup lang="ts">
import { computed, ref } from 'vue';
import { type ExperimentalData, parseEngineeringValue, formatForInput } from '../../utils/mathUtils';
import CalibrationControl from './sub/CalibrationControl.vue';
import DecadeGenerator from './sub/DecadeGenerator.vue';
import SignalGeneratorInput from './sub/SignalGeneratorInput.vue';

const props = defineProps<{
  experimentalData: ExperimentalData[];
  processedData: ExperimentalData[];
  globalVs: number;
  globalVsUnit?: string;
  globalVoUnit?: string;
  amplitudeMode: 'vpp' | 'vrms';
  maxGvDb: number;
  closestToCutoffId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'updateRow', id: number, field: 'freq' | 'vo' | 'phase', value: number | null): void;
  (e: 'deleteRow', id: number): void;
  (e: 'addRow'): void;
  (e: 'clearTable'): void;
  (e: 'updateVs', value: number): void;
  (e: 'updateVsUnit', value: string): void;
  (e: 'updateVoUnit', value: string): void;
  (e: 'updateAmplitudeMode', mode: 'vpp' | 'vrms'): void;
  (e: 'applyCalibration', factor: number): void;
  (e: 'generateDecades', start: number, end: number, pointsPerDecade: number): void;
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

const showGenerator = ref(false);

function onInputChange(e: Event, row: ExperimentalData, field: 'freq' | 'vo' | 'phase') {
  const target = e.target as HTMLInputElement;
  const valStr = target.value.trim();

  if (field === 'phase' && valStr === '') {
    emit('updateRow', row.id, field, null);
    return;
  }

  const parsed = parseEngineeringValue(valStr);
  if (!isNaN(parsed)) {
    emit('updateRow', row.id, field, parsed);
  } else {
    // Revert invalid input by forcing a re-render of the input value
    const currentVal = row[field];
    target.value = currentVal !== null && currentVal !== undefined ? currentVal.toString() : '';
  }
}

function handleKeydown(e: KeyboardEvent, rowId: number, field: string) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const isLastRow = props.experimentalData.length > 0 && props.experimentalData[props.experimentalData.length - 1].id === rowId;
    if (isLastRow && field === 'phase') {
      emit('addRow');
      setTimeout(() => {
        const newInputs = document.querySelectorAll('input[data-field="freq"]');
        if (newInputs.length > 0) {
          (newInputs[newInputs.length - 1] as HTMLElement).focus();
        }
      }, 50);
    }
  }
}

function getProcessedRow(id: number) {
  return props.processedData.find(p => p.id === id) || {
    gvDb: NaN,
    gvLinear: NaN,
    phase: 0,
    isInterpolated: false
  };
}
</script>

<template>
  <div class="cb-card p-5">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-lg font-bold tracking-tight flex items-center gap-2" style="color:var(--text-primary)">
          <span class="inline-block h-3 w-3 rounded" style="background:var(--primary)"></span>
          Dados do Experimento Prático (Laboratório)
        </h2>
        <p class="text-xs mt-1" style="color:var(--text-secondary)">
          Insira os dados lidos do gerador de sinais e osciloscópio. Deixe o campo Fase em branco próximo ao corte para testar a interpolação inteligente.
        </p>
      </div>

      <!-- Settings Panel removido a pedido do usuário -->

      <SignalGeneratorInput 
        :value="globalVs"
        :unit="globalVsUnit || 'V'"
        label="Vin"
        :amplitude-mode="amplitudeMode"
        storage-key="bench-generator-passive"
        @update:value="(val) => emit('updateVs', val)"
        @update:unit="(unit) => emit('updateVsUnit', unit)"
        @update:amplitude-mode="(mode) => emit('updateAmplitudeMode', mode)"
      />
      <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
        <button 
          @click="emit('clearTable')"
          v-if="experimentalData.length > 0"
          type="button" 
          class="flex-1 sm:flex-initial text-[11px] font-semibold px-3 py-1.5 rounded transition-all font-sans cursor-pointer" style="color:var(--error-text);background:var(--error-surface);border:1px solid rgba(239,68,68,0.2)"
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
            <th id="th-vo-label" class="py-3 px-4 transition-colors">
              <div class="flex items-center gap-1.5">
                <span>Vo (Saída)</span>
                <select 
                  :value="globalVoUnit || 'V'" 
                  @change="(e) => emit('updateVoUnit', (e.target as HTMLSelectElement).value)" 
                  class="cb-select-unit" 
                  style="border: 1px solid var(--border-default); border-radius: var(--radius-sm); font-size: 10px; padding-top: 2px; padding-bottom: 2px;"
                >
                  <option value="V">V</option>
                  <option value="mV">mV</option>
                  <option value="uV">µV</option>
                </select>
              </div>
            </th>
            <th class="py-3 px-4 text-center">Gv (Lin)</th>
            <th class="py-3 px-4 text-center">Av (dB)</th>
            <th class="py-3 px-4 text-center">Fase θ (°)</th>
            <th class="py-3 px-4 text-center w-16">Ação</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-slate-100 dark:divide-slate-850/60 font-mono">
          <tr v-if="experimentalData.length === 0">
            <td colspan="6" class="py-12 text-center">
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
            <td class="py-2.5 px-4">
              <input 
                type="text" 
                data-field="vo" 
                :value="formatForInput(row.vo)" 
                @change="e => onInputChange(e, row, 'vo')"
                @keydown="e => handleKeydown(e, row.id, 'vo')"
                class="cb-input text-xs py-1 px-2"
                :style="(row.vo || 0) > globalVs ? 'border-color:var(--error);color:var(--error-text)' : ''"
                :title="(row.vo || 0) > globalVs ? 'Alerta: Vo maior que Vs' : ''" 
              />
            </td>
            <td class="py-2.5 px-4 text-center font-mono text-xs" style="color:var(--text-secondary)">
              {{ isNaN(getProcessedRow(row.id).gvLinear as number) ? "N/A" : (getProcessedRow(row.id).gvLinear as number).toFixed(4) }}
            </td>
            <td class="py-2.5 px-4 text-center font-mono text-xs font-bold whitespace-nowrap" style="color:var(--success-text)">
              <span v-if="(!isNaN(getProcessedRow(row.id).gvDb as number) && getProcessedRow(row.id).gvDb === maxGvDb && processedData.length > 1)" class="material-symbols-outlined text-[14px] text-amber-500 align-text-bottom mr-1" title="Pico de Ganho">star</span>
              {{ isNaN(getProcessedRow(row.id).gvDb as number) ? "N/A" : `${(getProcessedRow(row.id).gvDb as number).toFixed(2)}` }}
            </td>
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
            <td class="py-2.5 px-4 text-center whitespace-nowrap">
              <button @click="emit('deleteRow', row.id)" type="button" class="transition-colors p-1 rounded border border-transparent" style="color:var(--error-text)" title="Excluir ponto">
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
          @click="emit('addRow')"
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
        <CalibrationControl label="Calibrar Vo" @apply="(factor) => emit('applyCalibration', factor)" />

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
      @generate="(start, end, points) => { emit('generateDecades', start, end, points); showGenerator = false; }"
      @cancel="showGenerator = false"
    />
  </div>
</template>

<style>
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}
.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(15px);
}
</style>
