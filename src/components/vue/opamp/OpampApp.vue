<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Topbar from '../Topbar.vue';
import Footer from '../Footer.vue';
import OpampDataTable from './OpampDataTable.vue';
import OpampChartsPanel from './OpampChartsPanel.vue';
import { analyzeOpampData } from '../../../utils/mathUtilsOpamp';
import type { OpampDataPoint } from '../../../utils/mathUtilsOpamp';
import OpampEquationCard from './OpampEquationCard.vue';
import { parseCsvContent } from '../../../utils/csvParser';

const experimentalData = ref<OpampDataPoint[]>([]);
const globalVinPp = ref<number>(1.0);
const globalVinUnit = ref<string>('V');
const globalVoutUnit = ref<string>('V');

// Load from local storage on mount
onMounted(() => {
  const saved = localStorage.getItem('circuit-book-opamp-data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      experimentalData.value = parsed.experimentalData || [];
      globalVinPp.value = parsed.globalVinPp || 1.0;
      globalVinUnit.value = parsed.globalVinUnit || 'V';
      globalVoutUnit.value = parsed.globalVoutUnit || 'V';
    } catch (e) {
      console.error("Failed to load opamp data", e);
    }
  }
});

const analysisResult = computed(() => {
  return analyzeOpampData(
    experimentalData.value, 
    globalVinPp.value,
    globalVinUnit.value,
    globalVoutUnit.value
  );
});

const selectedPoint = computed(() => {
  const cutoffId = analysisResult.value.closestToCutoffId;
  if (cutoffId !== null) {
    return analysisResult.value.processedPoints.find(p => p.id === cutoffId) || null;
  }
  return analysisResult.value.processedPoints[0] || null;
});

function handleImportCsv(text: string) {
  try {
    const parsed = parseCsvContent(text);
    if (parsed.points.length === 0) {
      alert("Nenhum ponto válido encontrado no arquivo CSV.");
      return;
    }

    // Se houver global Vs/Vin, atualiza
    if (parsed.globalValue !== null && parsed.globalValue !== undefined) {
      globalVinPp.value = parsed.globalValue;
      if (parsed.globalUnit) {
        globalVinUnit.value = parsed.globalUnit;
      }
    }

    // Mapear pontos para OpampDataPoint
    experimentalData.value = parsed.points.map((p, idx): OpampDataPoint => ({
      id: `csv-${idx + 1}`,
      freq: p.freq,
      vMax: p.vMax !== undefined && p.vMax !== null ? p.vMax : (p.vo !== undefined && p.vo !== null ? p.vo / 2 : 0),
      vMin: p.vMin !== undefined && p.vMin !== null ? p.vMin : (p.vo !== undefined && p.vo !== null ? -p.vo / 2 : 0),
      phase: p.phase !== undefined && p.phase !== null ? p.phase : null
    }));


    alert(`CSV importado com sucesso: ${parsed.points.length} pontos carregados.`);
  } catch (err: any) {
    alert(`Erro de parser CSV: ${err.message}`);
  }
}


const handleUpdateData = (newData: OpampDataPoint[]) => {
  experimentalData.value = newData;
  saveData();
};

const handleRemovePoint = (id: string) => {
  experimentalData.value = experimentalData.value.filter(p => p.id !== id);
  saveData();
};

const handleClearData = () => {
  if (confirm("Tem certeza que deseja limpar todos os dados experimentais?")) {
    experimentalData.value = [];
    saveData();
  }
};

const handleUpdateVinPp = (newVal: number) => {
  globalVinPp.value = newVal;
  saveData();
};

function getUnitMultiplier(unit: string) {
  if (unit === 'mV') return 1e-3;
  if (unit === 'uV') return 1e-6;
  return 1;
}

const handleUpdateVinUnit = (newUnit: string) => {
  const oldUnit = globalVinUnit.value;
  if (oldUnit === newUnit) return;
  const oldMult = getUnitMultiplier(oldUnit);
  const newMult = getUnitMultiplier(newUnit);
  globalVinPp.value = parseFloat((globalVinPp.value * (oldMult / newMult)).toFixed(6));
  globalVinUnit.value = newUnit;
  saveData();
};

const handleUpdateVoutUnit = (newUnit: string) => {
  const oldUnit = globalVoutUnit.value;
  if (oldUnit === newUnit) return;
  const oldMult = getUnitMultiplier(oldUnit);
  const newMult = getUnitMultiplier(newUnit);
  
  experimentalData.value.forEach(row => {
    if (row.vMax !== null) row.vMax = parseFloat((row.vMax * (oldMult / newMult)).toFixed(6));
    if (row.vMin !== null) row.vMin = parseFloat((row.vMin * (oldMult / newMult)).toFixed(6));
  });
  
  globalVoutUnit.value = newUnit;
  saveData();
};

const saveData = () => {
  localStorage.setItem('circuit-book-opamp-data', JSON.stringify({
    experimentalData: experimentalData.value,
    globalVinPp: globalVinPp.value,
    globalVinUnit: globalVinUnit.value,
    globalVoutUnit: globalVoutUnit.value
  }));
};

const exportToCsv = () => {
  const rows = analysisResult.value.processedPoints;
  if (rows.length === 0) {
    alert("Nenhum dado para exportar!");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += `Vin(Global),${globalVinPp.value} ${globalVinUnit.value}\n\n`;
  csvContent += "Frequencia(Hz),Vmax,Vmin,Unidade,Vout_pp(V),Gv(Linear),Av(dB),Fase(Graus)\n";

  rows.forEach((r: any) => {
    const vMax = r.vMax !== null ? r.vMax : "";
    const vMin = r.vMin !== null ? r.vMin : "";
    const vppOut = r.vppOut !== undefined && !isNaN(r.vppOut) ? r.vppOut.toFixed(4) : "N/A";
    const gvLinear = r.gvLinear !== undefined && !isNaN(r.gvLinear) ? r.gvLinear.toFixed(4) : "N/A";
    const gvDb = r.gvDb !== undefined && !isNaN(r.gvDb) ? r.gvDb.toFixed(4) : "N/A";
    const phase = r.phase !== null ? r.phase : "N/A";
    
    csvContent += `${r.freq},${vMax},${vMin},${globalVoutUnit.value},${vppOut},${gvLinear},${gvDb},${phase}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "dados_filtro_ativo_opamp.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
</script>

<template>
  <div class="space-y-6">
    <!-- Data Table Section -->
      <OpampDataTable 
        :experimentalData="experimentalData"
        :processedData="analysisResult.processedPoints"
        :closestToCutoffId="analysisResult.closestToCutoffId"
        :maxGvDb="analysisResult.maxGvDb"
        :globalVinPp="globalVinPp"
        :globalVinUnit="globalVinUnit"
        :globalVoutUnit="globalVoutUnit"
        @updateData="handleUpdateData"
        @removePoint="handleRemovePoint"
        @clearData="handleClearData"
        @updateVinPp="handleUpdateVinPp"
        @updateVinUnit="handleUpdateVinUnit"
        @updateVoutUnit="handleUpdateVoutUnit"
        @exportCsv="exportToCsv"
        @importCsv="handleImportCsv"
      />

      <!-- Equations and Scientific Foundations Details -->
      <div class="w-full" v-if="experimentalData.length > 0">
        <OpampEquationCard 
          :selectedPoint="selectedPoint"
          :fc="analysisResult ? analysisResult.cutoffFreq : null"
          :maxGvDb="analysisResult.maxGvDb"
          :detectedFilter="analysisResult ? analysisResult.detectedFilter : 'lowpass'"
          :detectedOrder="analysisResult ? analysisResult.detectedOrder : 1"
          :globalVs="globalVinPp"
          :globalVsUnit="globalVinUnit"
        />
      </div>

      <OpampChartsPanel 
        v-if="experimentalData.length > 0"
        :processed-data="(analysisResult.processedPoints as any)"
        :cutoff-frequency="analysisResult.cutoffFreq"
      />
  </div>
</template>
