<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  initialStart?: number;
  initialEnd?: number;
  initialPoints?: number;
}>();

const emit = defineEmits<{
  (e: 'generate', start: number, end: number, points: number): void;
  (e: 'cancel'): void;
}>();

const genStart = ref(props.initialStart ?? 10);
const genEnd = ref(props.initialEnd ?? 10000);
const genPoints = ref(props.initialPoints ?? 3);

function handleGenerate() {
  emit('generate', genStart.value, genEnd.value, genPoints.value);
}
</script>

<template>
  <div class="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg flex flex-col gap-3 transition-all">
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
        @click="handleGenerate"
        type="button" 
        class="text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 px-5 py-2 rounded shadow-sm transition-colors cursor-pointer"
      >
        Gerar
      </button>
      <button 
        @click="emit('cancel')"
        type="button" 
        class="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-3 py-2 transition-colors ml-auto cursor-pointer"
      >
        Cancelar
      </button>
    </div>
  </div>
</template>
