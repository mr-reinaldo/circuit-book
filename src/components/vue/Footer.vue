<template>
  <footer class="w-full py-8 font-sans text-xs" style="background:var(--surface-base);border-top:1px solid var(--border-subtle)">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
      <p class="font-mono text-center md:text-left" style="color:var(--text-tertiary)">
        © 2026. Todos os direitos reservados. Código licenciado sob a Licença MIT.
      </p>
      
      <!-- Visit counter widget -->
      <div 
        class="flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[11px] border transition-all duration-300 select-none"
        style="background:var(--surface-input); border-color:var(--border-subtle)"
      >
        <span 
          class="w-1.5 h-1.5 rounded-full animate-pulse" 
          style="background-color: var(--primary)"
        ></span>
        <span style="color:var(--text-secondary)">Visualizações:</span>
        <span v-if="loading" class="w-8 h-3 rounded animate-pulse" style="background-color: var(--border-default)"></span>
        <span v-else-if="count" class="font-bold" style="color:var(--primary-text)">{{ count }}</span>
        <span v-else class="font-bold" style="color:var(--text-tertiary)">--</span>
      </div>
    </div>
  </footer>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const count = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const response = await fetch('https://mr-reinaldo.goatcounter.com/counter/TOTAL.json');
    if (!response.ok) throw new Error('Não foi possível obter os dados do contador');
    const data = await response.json();
    count.value = data.count;
  } catch (error) {
    console.error('[GoatCounter] Erro ao buscar o contador de visitas:', error);
  } finally {
    loading.value = false;
  }
});
</script>

