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
  <div class="mt-4 p-4 rounded-lg flex flex-col gap-3 transition-all" style="background:var(--primary-surface);border:1px solid var(--primary-border)">
    <div class="flex items-center gap-2" style="color:var(--primary-text)">
      <span class="material-symbols-outlined text-[18px]">auto_fix_high</span>
      <h3 class="font-bold text-sm">Gerador de Frequências (Logarítmico)</h3>
    </div>
    <p class="cb-subtitle" style="color:var(--primary-text);opacity:0.8">Gere automaticamente as linhas da tabela preenchendo as frequências em uma escala logarítmica (décadas).</p>
    
    <div class="flex flex-wrap items-end gap-3 mt-1">
      <div class="flex flex-col gap-1">
        <label class="cb-section-label" style="color:var(--primary-text)">Freq Inicial (Hz)</label>
        <input type="number" v-model="genStart" class="cb-input w-28 py-1.5 px-3 text-xs" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="cb-section-label" style="color:var(--primary-text)">Freq Final (Hz)</label>
        <input type="number" v-model="genEnd" class="cb-input w-32 py-1.5 px-3 text-xs" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="cb-section-label" style="color:var(--primary-text)">Pontos por Década</label>
        <select v-model="genPoints" class="cb-input w-40 py-1.5 px-3 text-xs font-bold cursor-pointer">
          <option :value="1">1 Ponto (10, 100...)</option>
          <option :value="3">3 Pontos (10, 20, 50...)</option>
          <option :value="9">9 Pontos (10..90, 100...)</option>
        </select>
      </div>
      <button 
        @click="handleGenerate"
        type="button" 
        class="cb-btn px-5 py-2"
      >
        Gerar
      </button>
      <button 
        @click="emit('cancel')"
        type="button" 
        class="text-xs font-bold px-3 py-2 transition-colors ml-auto cursor-pointer" style="color:var(--text-tertiary)"
      >
        Cancelar
      </button>
    </div>
  </div>
</template>
