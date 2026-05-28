<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  (e: 'apply', factor: number): void;
}>();

const calibrationFactor = ref(10);
</script>

<template>
  <div class="flex items-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded overflow-hidden shadow-sm">
    <label class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-2 border-r border-slate-200 dark:border-slate-700">Ponta de Prova</label>
    <select 
      v-model="calibrationFactor"
      class="bg-transparent text-slate-700 dark:text-slate-200 font-mono text-xs font-bold px-2 py-2 outline-none cursor-pointer hover:bg-slate-105 transition-colors"
    >
      <option :value="10">x10</option>
      <option :value="0.1">x0.1</option>
      <option :value="100">x100</option>
      <option :value="0.01">x0.01</option>
    </select>
    <button 
      @click="emit('apply', Number(calibrationFactor))"
      type="button" 
      class="bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-400 font-bold text-[10px] uppercase tracking-wider px-3 py-2 border-l border-amber-200 dark:border-amber-800 transition-colors flex items-center gap-1 cursor-pointer"
      title="Multiplicar todos os valores atuais de Vmax e Vmin por este fator"
    >
      <span class="material-symbols-outlined text-[14px]">electric_meter</span> Calibrar Vo
    </button>
  </div>
</template>
