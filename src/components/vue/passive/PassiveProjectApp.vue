<script setup lang="ts">
// Trigger HMR
import PassiveFilterDesigner from './PassiveFilterDesigner.vue';
</script>

<template>
  <div class="space-y-6">
    <div class="cb-card p-6">
      <h2 class="text-xl font-bold mb-2" style="color:var(--text-primary)">Projeto de Filtros Passivos</h2>
      <p class="mb-6" style="color:var(--text-secondary)">
        Esta ferramenta permite projetar os circuitos (RC, RL, Cascata RC e RLC de 2ª ordem) 
        para a prototipagem real, encontrando os resistores, capacitores e indutores comerciais adequados 
        para a sua frequência de corte alvo.
      </p>
      
      <PassiveFilterDesigner />
    </div>
  </div>
</template>
