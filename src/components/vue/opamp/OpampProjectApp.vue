<script setup lang="ts">
import OpampFilterDesigner from './OpampFilterDesigner.vue';
</script>

<template>
  <div class="space-y-6">
    <div class="cb-card p-6">
      <h2 class="text-xl font-bold mb-2" style="color:var(--text-primary)">Projeto de Filtros Ativos</h2>
      <p class="mb-6" style="color:var(--text-secondary)">
        Esta ferramenta permite projetar os circuitos (1ª ordem e Cascata Passiva de 2ª ordem) 
        para a prototipagem real, encontrando os resistores e capacitores comerciais adequados 
        para a sua frequência de corte alvo.
      </p>
      
      <OpampFilterDesigner />
    </div>
  </div>
</template>
