<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  label?: string;
}>();

const emit = defineEmits<{
  (e: 'apply', factor: number): void;
}>();

const mode = ref('presets'); // 'presets' | 'custom'
const selectedPreset = ref('10');
const operation = ref('multiply'); // 'multiply' | 'divide'
const customFactor = ref(1.0);

function handleApply() {
  let factor = 1.0;
  if (mode.value === 'presets') {
    factor = parseFloat(selectedPreset.value);
  } else {
    const rawVal = Number(customFactor.value);
    if (isNaN(rawVal) || rawVal <= 0) {
      window.dispatchEvent(new CustomEvent('show-toast', { 
        detail: { message: "Fator de calibração inválido. Use um número maior que zero.", type: "error" } 
      }));
      return;
    }
    factor = rawVal;
    if (operation.value === 'divide') {
      factor = 1 / factor;
    }
  }
  emit('apply', factor);
  
  window.dispatchEvent(new CustomEvent('show-toast', { 
    detail: { message: `Calibração aplicada! Fator multiplicador real: x${factor.toFixed(4)}`, type: "success" } 
  }));
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 rounded-lg p-1.5 transition-all shadow-sm border border-[var(--border-default)]" style="background:var(--surface-input)">
    <div class="flex items-center gap-1">
      <span class="material-symbols-outlined text-[16px]" style="color:var(--text-tertiary)">electric_meter</span>
      <span class="text-[10px] font-bold uppercase tracking-wider pr-1" style="color:var(--text-secondary)">{{ label || 'Calibrar' }}</span>
    </div>

    <!-- Alternador Presets / Personalizado -->
    <div class="flex rounded overflow-hidden border border-[var(--border-default)]" style="background:var(--surface-card)">
      <button 
        type="button" 
        @click="mode = 'presets'" 
        class="text-[9px] font-bold px-2 py-1 cursor-pointer transition-colors" 
        :class="mode === 'presets' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'"
      >
        Preset
      </button>
      <button 
        type="button" 
        @click="mode = 'custom'" 
        class="text-[9px] font-bold px-2 py-1 cursor-pointer transition-colors" 
        :class="mode === 'custom' ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'"
      >
        Avançado
      </button>
    </div>

    <!-- Seletor de Presets -->
    <select 
      v-if="mode === 'presets'"
      v-model="selectedPreset"
      class="bg-[var(--surface-card)] rounded border border-[var(--border-default)] font-mono text-xs font-bold px-2 py-1 outline-none cursor-pointer text-[var(--text-primary)]"
    >
      <option value="10">x10 (Atenuação)</option>
      <option value="0.1">x0.1 (Amplificação)</option>
      <option value="100">x100 (Alta Tensão)</option>
      <option value="1.414">x1.414 (RMS ➔ Pico)</option>
      <option value="0.707">x0.707 (Pico ➔ RMS)</option>
      <option value="2">x2.0 (Dobrar)</option>
      <option value="0.5">x0.5 (Metade)</option>
    </select>

    <!-- Controles Avançados Personalizados -->
    <div v-else class="flex items-center gap-1 animate-fade-in">
      <select 
        v-model="operation"
        class="bg-[var(--surface-card)] rounded border border-[var(--border-default)] font-mono text-[10px] font-bold px-1.5 py-1 outline-none cursor-pointer text-[var(--text-primary)]"
      >
        <option value="multiply">Multiplicar por (×)</option>
        <option value="divide">Dividir por (÷)</option>
      </select>
      <input 
        type="number" 
        step="any"
        min="0.0001"
        v-model="customFactor"
        class="w-16 text-center py-1 px-1 rounded border border-[var(--border-default)] font-mono text-xs font-bold bg-[var(--surface-card)] text-[var(--primary-text)] focus:outline-none focus:border-[var(--primary)]"
      />
    </div>

    <!-- Botão Aplicar -->
    <button 
      @click="handleApply"
      type="button" 
      class="font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded transition-colors flex items-center gap-1 cursor-pointer" 
      style="background:var(--warning-surface);color:var(--warning-text);border:1px solid rgba(217,119,6,0.2)"
      title="Aplicar ajuste de calibração em todos os pontos da tabela"
    >
      Aplicar
    </button>
  </div>
</template>

<style scoped>
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
.animate-fade-in {
  animation: fadeIn 0.15s ease-out forwards;
}
</style>
