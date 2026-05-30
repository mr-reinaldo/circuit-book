<script setup lang="ts">
import { parseEngineeringValue } from '../../../utils/mathUtils';

const props = defineProps<{
  value: number;
  unit: string;
  label?: string;
  mode?: 'passive' | 'active'; // Kept for backwards compatibility but not used in UI anymore
  amplitudeMode: 'vpp' | 'vrms';
  storageKey?: string;
}>();

const emit = defineEmits<{
  (e: 'update:value', val: number): void;
  (e: 'update:unit', unit: string): void;
  (e: 'update:amplitudeMode', mode: 'vpp' | 'vrms'): void;
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
  const step = props.value >= 10 ? 1.0 : props.value >= 1 ? 0.1 : 0.01;
  const currentStr = props.value.toString();
  const decimalIndex = currentStr.indexOf('.');
  const decimals = decimalIndex === -1 ? 2 : Math.min(Math.max(currentStr.length - decimalIndex - 1, 2), 6);
  
  const next = parseFloat((props.value + step).toFixed(decimals));
  emit('update:value', next);
}

function dec() {
  const step = props.value > 10 ? 1.0 : props.value > 1 ? 0.1 : 0.01;
  const currentStr = props.value.toString();
  const decimalIndex = currentStr.indexOf('.');
  const decimals = decimalIndex === -1 ? 2 : Math.min(Math.max(currentStr.length - decimalIndex - 1, 2), 6);
  
  const next = parseFloat((props.value - step).toFixed(decimals));
  if (next > 0) emit('update:value', next);
}

// Toggle Amplitude Mode (Vpp / Vrms) and scale values automatically
function toggleAmplitudeMode() {
  const oldMode = props.amplitudeMode;
  const newMode = oldMode === 'vpp' ? 'vrms' : 'vpp';
  emit('update:amplitudeMode', newMode);
  
  // Recalcular valor de amplitude (Vrms = Vpp / (2 * sqrt(2)) -> Vpp = Vrms * 2 * sqrt(2))
  let newValue = props.value;
  if (newMode === 'vrms') {
    newValue = props.value / (2 * Math.sqrt(2));
  } else {
    newValue = props.value * (2 * Math.sqrt(2));
  }
  
  emit('update:value', parseFloat(newValue.toFixed(4)));
  
  window.dispatchEvent(new CustomEvent('show-toast', { 
    detail: { message: `Modo de entrada alternado para: ${newMode.toUpperCase()}`, type: "info" } 
  }));
}
</script>

<template>
  <div 
    class="flex items-center gap-2 border-[1.5px] rounded-lg px-3 py-1 h-10 font-sans shadow-sm transition-all bg-[var(--surface-input)] border-[var(--border-default)] hover:border-[var(--text-tertiary)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/10"
  >
    <!-- Label dinâmico baseado no modo de amplitude -->
    <span class="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] pr-1.5 border-r border-[var(--border-default)] h-4 flex items-center mr-1 whitespace-nowrap">
      {{ label || 'Vin' }} ({{ amplitudeMode === 'vpp' ? 'Vpp' : 'Vrms' }})
    </span>

    <!-- Controles de Amplitude -->
    <div class="flex items-center">
      <button 
        @click="dec" 
        type="button" 
        class="h-6 w-5 flex items-center justify-center transition-colors focus:outline-none rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
      >
        <span class="material-symbols-outlined text-[13px] font-bold">remove</span>
      </button>

      <input 
        type="text" 
        class="w-16 bg-transparent text-center focus:outline-none font-bold text-xs py-0.5 tracking-wide font-mono color-[var(--primary-text)]"
        :value="value"
        @change="onInputChange"
      />

      <!-- Unit Selector -->
      <select 
        :value="unit" 
        @change="(e) => emit('update:unit', (e.target as HTMLSelectElement).value)" 
        class="cb-select-unit font-bold text-[10px] w-[42px] border-none bg-transparent cursor-pointer text-[var(--primary-text)]"
        style="padding-left: 2px; padding-right: 12px; margin: 0; background-position: right 2px center; background-size: 8px 8px;"
      >
        <option value="V">V</option>
        <option value="mV">mV</option>
        <option value="uV">µV</option>
      </select>

      <button 
        @click="inc" 
        type="button" 
        class="h-6 w-5 flex items-center justify-center transition-colors focus:outline-none rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
      >
        <span class="material-symbols-outlined text-[13px] font-bold">add</span>
      </button>
    </div>

    <!-- Divisor vertical -->
    <span class="h-4 border-r border-[var(--border-default)] mx-1"></span>

    <!-- Vpp / Vrms Toggle Inline -->
    <button 
      @click="toggleAmplitudeMode"
      type="button" 
      class="h-6.5 px-2 rounded border border-[var(--border-default)] bg-[var(--surface-card)] transition-colors text-[9px] font-black focus:outline-none flex items-center justify-center uppercase font-mono cursor-pointer hover:bg-[var(--surface-hover)]"
      :class="[
        amplitudeMode === 'vpp' ? 'text-[var(--primary)] border-[var(--primary-border)] bg-[var(--primary-surface)]' : 'text-[var(--text-secondary)]'
      ]"
      title="Alternar entre Pico-a-Pico (Vpp) e Valor Eficaz (Vrms)"
    >
      {{ amplitudeMode }}
    </button>
  </div>
</template>
