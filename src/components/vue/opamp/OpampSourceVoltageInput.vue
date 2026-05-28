<script setup lang="ts">
import { parseEngineeringValue } from '../../../utils/mathUtilsOpamp';

const props = defineProps<{
  value: number;
  unit: string;
  label?: string;
}>();

const emit = defineEmits<{
  (e: 'update:value', val: number): void;
  (e: 'update:unit', unit: string): void;
}>();

function onInputChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const parsed = parseEngineeringValue(target.value);
  if (!isNaN(parsed) && parsed > 0) {
    emit('update:value', parsed);
  } else {
    target.value = props.value.toString();
  }
}

function inc() {
  const step = props.value >= 10 ? 1.0 : 0.1;
  emit('update:value', Number((props.value + step).toFixed(2)));
}

function dec() {
  const step = props.value > 10 ? 1.0 : 0.1;
  const next = Number((props.value - step).toFixed(2));
  if (next > 0) emit('update:value', next);
}
</script>

<template>
  <div class="flex items-center gap-3 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-800 w-full sm:w-auto shadow-inner transition-colors duration-300">
    <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{{ label || 'Vin(pp)' }}</label>
    <div class="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded overflow-hidden">
      <button @click="dec" type="button" class="px-2 py-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors" title="Diminuir">
        <span class="material-symbols-outlined text-[14px]">remove</span>
      </button>
      <input 
        type="text" 
        class="w-14 bg-transparent text-center focus:outline-none text-indigo-600 dark:text-indigo-400 font-mono text-sm font-bold" 
        :value="value"
        @change="onInputChange"
      />
      <select :value="unit" @change="(e) => emit('update:unit', (e.target as HTMLSelectElement).value)" class="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] uppercase font-bold px-1 py-1.5 border-l border-slate-300 dark:border-slate-700 outline-none cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors appearance-none text-center">
        <option value="V">V</option>
        <option value="mV">mV</option>
        <option value="uV">µV</option>
      </select>
      <button @click="inc" type="button" class="px-2 py-1 text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors border-l border-slate-300 dark:border-slate-700" title="Aumentar">
        <span class="material-symbols-outlined text-[14px]">add</span>
      </button>
    </div>
  </div>
</template>
