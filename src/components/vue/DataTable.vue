<script setup lang="ts">
import { computed, ref } from 'vue';
import { type ExperimentalData, parseEngineeringValue, formatForInput } from '../../utils/mathUtils';

const props = defineProps<{
  experimentalData: ExperimentalData[];
  processedData: ExperimentalData[];
  globalVs: number;
  globalVsUnit?: string;
  globalVoUnit?: string;
  maxGvDb: number;
  closestToCutoffId?: number | null;
  manualFcId?: number | null;
}>();

const emit = defineEmits<{
  (e: 'updateRow', id: number, field: 'freq' | 'vo' | 'phase', value: number | null): void;
  (e: 'deleteRow', id: number): void;
  (e: 'addRow'): void;
  (e: 'clearTable'): void;
  (e: 'updateVs', value: number): void;
  (e: 'updateVsUnit', value: string): void;
  (e: 'updateVoUnit', value: string): void;
  (e: 'setManualFc', id: number | null): void;
  (e: 'applyCalibration', factor: number): void;
  (e: 'generateDecades', start: number, end: number, pointsPerDecade: number): void;
  (e: 'exportCsv'): void;
}>();

const calibrationFactor = ref(10);

const showGenerator = ref(false);
const genStart = ref(10);
const genEnd = ref(10000);
const genPoints = ref(3);

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
      // Focus will be handled by the parent or a watcher if needed, 
      // but for simplicity we can just let it add the row.
      setTimeout(() => {
        const newInputs = document.querySelectorAll('input[data-field="freq"]');
        if (newInputs.length > 0) {
          (newInputs[newInputs.length - 1] as HTMLElement).focus();
        }
      }, 50);
    }
  }
}

function onVsChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const parsed = parseEngineeringValue(target.value);
  if (!isNaN(parsed) && parsed > 0) {
    emit('updateVs', parsed);
  } else {
    target.value = props.globalVs.toString();
  }
}

function incVs() {
  const step = props.globalVs >= 10 ? 1.0 : 0.1;
  emit('updateVs', Number((props.globalVs + step).toFixed(2)));
}

function decVs() {
  const step = props.globalVs > 10 ? 1.0 : 0.1;
  const next = Number((props.globalVs - step).toFixed(2));
  if (next > 0) emit('updateVs', next);
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
  <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition-colors duration-300">
    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
      <div>
        <h2 class="text-lg font-bold tracking-tight text-slate-800 dark:text-white flex items-center gap-2">
          <span class="inline-block h-3 w-3 rounded bg-emerald-500"></span>
          Dados do Experimento Prático (Laboratório)
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Insira os dados lidos do gerador de sinais e osciloscópio. Deixe o campo Fase em branco próximo ao corte para testar a interpolação inteligente.
        </p>
      </div>

      <!-- Settings Panel removido a pedido do usuário -->

      <div class="flex items-center gap-3 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 w-full sm:w-auto shadow-inner transition-colors duration-300">
        <label for="global-vs" class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">Vs (Fonte)</label>
        <div class="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded overflow-hidden">
          <button @click="decVs" type="button" class="px-2 py-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors" title="Diminuir 0.1V">
            <span class="material-symbols-outlined text-[14px]">remove</span>
          </button>
          <input 
            type="text" 
            id="global-vs" 
            class="w-14 bg-transparent text-center focus:outline-none text-indigo-600 dark:text-indigo-400 font-mono text-sm font-bold" 
            :value="globalVs"
            @change="onVsChange"
          />
          <select id="global-vs-unit" :value="globalVsUnit || 'V'" @change="(e) => emit('updateVsUnit', (e.target as HTMLSelectElement).value)" class="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] uppercase font-bold px-1 py-1.5 border-l border-slate-300 dark:border-slate-700 outline-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors appearance-none text-center">
            <option value="V">V</option>
            <option value="mV">mV</option>
            <option value="uV">µV</option>
          </select>
          <button @click="incVs" type="button" class="px-2 py-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors border-l border-slate-300 dark:border-slate-700" title="Aumentar">
            <span class="material-symbols-outlined text-[14px]">add</span>
          </button>
        </div>
      </div>
      <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
        <button 
          @click="emit('clearTable')"
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
            <th class="py-3 px-4">Frequência (Hz)</th>
            <th id="th-vo-label" class="py-3 px-4 transition-colors">
              <div class="flex items-center gap-1.5">
                <span>Vo (Saída)</span>
                <select :value="globalVoUnit || 'V'" @change="(e) => emit('updateVoUnit', (e.target as HTMLSelectElement).value)" class="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-[9px] px-1 py-0.5 rounded cursor-pointer outline-none hover:border-slate-400 dark:hover:border-slate-500 transition-colors appearance-none text-center font-bold">
                  <option value="V">V</option>
                  <option value="mV">mV</option>
                  <option value="uV">µV</option>
                </select>
              </div>
            </th>
            <th class="py-3 px-4 text-center">Gv (Linear)</th>
            <th class="py-3 px-4 text-center">Av (dB)</th>
            <th class="py-3 px-4 text-center">Fase θ (Graus)</th>
            <th class="py-3 px-4 text-center w-16">Ação</th>
          </tr>
        </thead>
        <TransitionGroup tag="tbody" name="list" class="divide-y divide-slate-100 dark:divide-slate-850/60 font-mono">
          <tr v-if="experimentalData.length === 0">
            <td colspan="6" class="py-12 text-center">
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
              (!isNaN(getProcessedRow(row.id).gvDb as number) && getProcessedRow(row.id).gvDb === maxGvDb && processedData.length > 1) ? 'bg-indigo-50/50 dark:bg-indigo-900/20' : 
              (closestToCutoffId === row.id) ? 'bg-orange-50/50 dark:bg-orange-900/20' : 'hover:bg-slate-100 dark:hover:bg-slate-900/40',
              'border-b border-slate-200 dark:border-slate-900/50 transition-colors'
            ]"
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
                  :class="[
                    closestToCutoffId === row.id ? 'border-orange-300 dark:border-orange-500/50 focus:border-orange-500 focus:ring-orange-500 bg-orange-50/50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600',
                    'w-full rounded px-2 py-1 focus:ring-1 focus:outline-none font-mono text-xs transition-colors'
                  ]"
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
                :class="[
                  (row.vo || 0) > globalVs ? 'border-rose-500 focus:border-rose-500 focus:ring-rose-500 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600',
                  'w-full rounded px-2 focus:ring-1 py-1 focus:outline-none font-mono text-xs transition-colors'
                ]"
                :title="(row.vo || 0) > globalVs ? 'Alerta: Vo maior que Vs' : ''" 
              />
            </td>
            <td class="py-2.5 px-4 text-center text-slate-600 dark:text-slate-300 font-mono text-xs">
              {{ isNaN(getProcessedRow(row.id).gvLinear as number) ? "N/A" : (getProcessedRow(row.id).gvLinear as number).toFixed(4) }}
            </td>
            <td class="py-2.5 px-4 text-center text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold whitespace-nowrap">
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
                :class="[
                  'w-full bg-slate-50 dark:bg-slate-900/50 border hover:border-slate-300 dark:hover:border-slate-600 rounded px-2 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-1 focus:outline-none font-mono text-xs transition-colors',
                  getProcessedRow(row.id).isInterpolated ? 'border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 placeholder:text-indigo-400 dark:placeholder:text-indigo-500' : 'border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'
                ]"
                :title="getProcessedRow(row.id).isInterpolated ? 'Valor calculado automaticamente. Digite para substituir.' : ''"
              />
            </td>
            <td class="py-2.5 px-4 text-center whitespace-nowrap">
              <button 
                @click="manualFcId === row.id ? emit('setManualFc', null) : emit('setManualFc', row.id)" 
                type="button" 
                :class="[
                  manualFcId === row.id ? 'text-orange-500 bg-orange-50 dark:bg-orange-500/20 border-orange-200 dark:border-orange-500/30' : 'text-slate-400 dark:text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 border-transparent',
                  'transition-colors p-1 rounded mr-2 border'
                ]" 
                :title="manualFcId === row.id ? 'Desmarcar como Frequência de Corte (Voltar ao Automático)' : 'Marcar como Frequência de Corte (fc)'"
              >
                <span class="material-symbols-outlined text-[16px]">my_location</span>
              </button>
              <button @click="emit('deleteRow', row.id)" type="button" class="text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent" title="Excluir ponto">
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
        <div class="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
          <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 border-r border-slate-200 dark:border-slate-700">Ponta de Prova</label>
          <select 
            v-model="calibrationFactor"
            class="bg-transparent text-slate-700 dark:text-slate-200 font-mono text-xs font-bold px-2 py-2 outline-none cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <option :value="10">x10</option>
            <option :value="0.1">x0.1</option>
            <option :value="100">x100</option>
            <option :value="0.01">x0.01</option>
          </select>
          <button 
            @click="emit('applyCalibration', Number(calibrationFactor))"
            type="button" 
            class="bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 font-bold text-[10px] uppercase tracking-wider px-3 py-2 border-l border-amber-200 dark:border-amber-800 transition-colors flex items-center gap-1"
            title="Multiplicar todos os valores atuais de Vo por este fator"
          >
            <span class="material-symbols-outlined text-[14px]">electric_meter</span> Calibrar Vo
          </button>
        </div>

        <button 
          @click="emit('exportCsv')"
          type="button" 
          class="w-full sm:w-auto text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-4 py-2 rounded flex items-center justify-center gap-1 transition-all"
        >
          <span class="material-symbols-outlined text-[16px]">save</span> Exportar Tabela (CSV)
        </button>
      </div>
    </div>
    
    <!-- Generator Panel -->
    <div v-if="showGenerator" class="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg flex flex-col gap-3 transition-all">
      <div class="flex items-center gap-2 text-indigo-800 dark:text-indigo-300">
        <span class="material-symbols-outlined text-[18px]">auto_fix_high</span>
        <h3 class="font-bold text-sm">Gerador de Frequências (Logarítmico)</h3>
      </div>
      <p class="text-xs text-indigo-600 dark:text-indigo-400">Gere automaticamente as linhas da tabela preenchendo as frequências em uma escala logarítmica (décadas).</p>
      
      <div class="flex flex-wrap items-end gap-3 mt-1">
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Freq Inicial (Hz)</label>
          <input type="number" v-model="genStart" class="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded px-3 py-1.5 text-xs font-mono w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Freq Final (Hz)</label>
          <input type="number" v-model="genEnd" class="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded px-3 py-1.5 text-xs font-mono w-32 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-200" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">Pontos por Década</label>
          <select v-model="genPoints" class="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-700 rounded px-3 py-1.5 text-xs font-bold w-40 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer text-slate-800 dark:text-slate-200">
            <option :value="1">1 Ponto (10, 100...)</option>
            <option :value="3">3 Pontos (10, 20, 50...)</option>
            <option :value="9">9 Pontos (10..90, 100...)</option>
          </select>
        </div>
        <button 
          @click="emit('generateDecades', genStart, genEnd, genPoints); showGenerator = false;"
          type="button" 
          class="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded shadow-sm transition-colors"
        >
          Gerar
        </button>
        <button 
          @click="showGenerator = false"
          type="button" 
          class="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-2 transition-colors ml-auto"
        >
          Cancelar
        </button>
      </div>
    </div>
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
