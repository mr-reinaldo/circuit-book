<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { type ExperimentalData, analyzeCutoffAndInterpolation } from '../../utils/mathUtils';
import DataTable from './DataTable.vue';
import ChartsPanel from './ChartsPanel.vue';
import EquationCard from './EquationCard.vue';
import { parseCsvContent } from '../../utils/csvParser';

// --- State ---
const isMounted = ref(false);
const experimentalData = ref<ExperimentalData[]>([]);
const globalVs = ref(1.0);
const globalVsUnit = ref('V');
const globalVoUnit = ref('V');

// --- Computed ---
const analysisResult = computed(() => {
  return analyzeCutoffAndInterpolation(experimentalData.value, globalVs.value, globalVsUnit.value, globalVoUnit.value);
});

const processedData = computed(() => {
  return analysisResult.value ? analysisResult.value.processedPoints : [];
});

const maxGvDb = computed(() => {
  return analysisResult.value ? analysisResult.value.maxGvDb : -Infinity;
});

const cutoffFrequency = computed(() => {
  return analysisResult.value ? analysisResult.value.closestToCutoffFreq : null;
});

const closestToCutoffId = computed(() => {
  // Se houver marcação manual, retorna ela (o próprio mathUtils já faz isso, mas fica explícito)
  return analysisResult.value ? analysisResult.value.closestToCutoffId : null;
});

const selectedPoint = computed(() => {
  if (closestToCutoffId.value !== null) {
    return processedData.value.find(p => p.id === closestToCutoffId.value) || null;
  }
  return processedData.value[0] || null;
});

function handleImportCsv(text: string) {
  try {
    const parsed = parseCsvContent(text);
    if (parsed.points.length === 0) {
      showToast("Nenhum ponto válido encontrado no arquivo CSV.", "error");
      return;
    }

    // Se houver global Vs definido, atualiza
    if (parsed.globalValue !== null && parsed.globalValue !== undefined) {
      globalVs.value = parsed.globalValue;
      if (parsed.globalUnit) {
        globalVsUnit.value = parsed.globalUnit;
      }
    }

    // Mapear pontos
    experimentalData.value = parsed.points.map((p, idx): ExperimentalData => ({
      id: idx + 1,
      freq: p.freq,
      vo: p.vo !== undefined && p.vo !== null ? p.vo : ((p.vMax !== undefined && p.vMax !== null && p.vMin !== undefined && p.vMin !== null) ? Math.abs(p.vMax - p.vMin) : 0),
      phase: p.phase !== undefined && p.phase !== null ? p.phase : null
    }));

    showToast(`CSV importado com sucesso: ${parsed.points.length} pontos carregados.`, "success");
  } catch (err: any) {
    showToast(`Erro ao ler arquivo CSV: ${err.message}`, "error");
  }
}

// --- Modal State ---
const isConfirmModalOpen = ref(false);
const confirmModalTitle = ref('');
const confirmModalMessage = ref('');
const confirmModalCallback = ref<() => void>(() => {});

function showConfirm(title: string, message: string, onConfirm: () => void) {
  confirmModalTitle.value = title;
  confirmModalMessage.value = message;
  confirmModalCallback.value = onConfirm;
  isConfirmModalOpen.value = true;
}

function closeConfirm() {
  isConfirmModalOpen.value = false;
}

function handleConfirm() {
  confirmModalCallback.value();
  closeConfirm();
}

// --- Toast State ---
interface Toast {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}
const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;

function showToast(message: string, type: 'success' | 'info' | 'error' = 'info') {
  const id = toastIdCounter++;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 3000);
}

// --- Local Storage ---
function saveStateToStorage() {
  try {
    const dataToSave = {
      experimentalData: experimentalData.value,
      globalVs: globalVs.value,
      globalVsUnit: globalVsUnit.value,
      globalVoUnit: globalVoUnit.value
    };
    localStorage.setItem('circuitBookState', JSON.stringify(dataToSave));
  } catch (e) {
    console.warn("Could not save state to localStorage", e);
  }
}

function loadStateFromStorage(): boolean {
  try {
    const saved = localStorage.getItem('circuitBookState');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.experimentalData && Array.isArray(parsed.experimentalData)) {
        experimentalData.value = parsed.experimentalData;
        if (parsed.globalVs) globalVs.value = parsed.globalVs;
        if (parsed.globalVsUnit) globalVsUnit.value = parsed.globalVsUnit;
        if (parsed.globalVoUnit) globalVoUnit.value = parsed.globalVoUnit;
        return true;
      }
    }
  } catch (e) {
    console.warn("Could not load state from localStorage", e);
  }
  return false;
}

// Watchers to auto-save and auto-sort
watch([experimentalData, globalVs, globalVsUnit, globalVoUnit], () => {
  // Sort automatically by frequency whenever data changes
  experimentalData.value.sort((a, b) => a.freq - b.freq);
  saveStateToStorage();
}, { deep: true });

// --- Handlers ---
function updateRow(id: number, field: 'freq' | 'vo' | 'phase', value: number | null) {
  const index = experimentalData.value.findIndex(r => r.id === id);
  if (index !== -1) {
    experimentalData.value[index][field] = value as any;
  }
}

function deleteRow(id: number) {
  showConfirm(
    'Excluir Ponto',
    'Tem certeza que deseja apagar este ponto da tabela? Isso recalculará os gráficos.',
    () => {
      experimentalData.value = experimentalData.value.filter(r => r.id !== id);
      showToast("Ponto excluído com sucesso.", "success");
    }
  );
}

function addRow() {
  const newId = experimentalData.value.length > 0 ? Math.max(...experimentalData.value.map(d => d.id)) + 1 : 1;
  
  let initialFreq = 10;
  if (experimentalData.value.length > 0) {
    const lastFreq = experimentalData.value[experimentalData.value.length - 1].freq;
    if (lastFreq < 100) initialFreq = lastFreq + 10;
    else if (lastFreq < 1000) initialFreq = lastFreq + 100;
    else initialFreq = lastFreq + 1000;
  }

  experimentalData.value.push({
    id: newId,
    freq: initialFreq,
    vo: 0,
    phase: null
  });
}

function clearTable() {
  showConfirm(
    'Limpar Tabela',
    'Tem certeza que deseja apagar TODOS os pontos da tabela? Esta ação não pode ser desfeita.',
    () => {
      experimentalData.value = [];
      showToast("Tabela limpa com sucesso.", "info");
    }
  );
}

function updateVs(value: number) {
  globalVs.value = value;
}

function getUnitMultiplier(unit: string) {
  if (unit === 'mV') return 1e-3;
  if (unit === 'uV') return 1e-6;
  return 1;
}

function updateVsUnit(newUnit: string) {
  const oldUnit = globalVsUnit.value;
  if (oldUnit === newUnit) return;
  
  const oldMult = getUnitMultiplier(oldUnit);
  const newMult = getUnitMultiplier(newUnit);
  
  globalVs.value = parseFloat((globalVs.value * (oldMult / newMult)).toFixed(6));
  globalVsUnit.value = newUnit;
}

function updateVoUnit(newUnit: string) {
  const oldUnit = globalVoUnit.value;
  if (oldUnit === newUnit) return;
  
  const oldMult = getUnitMultiplier(oldUnit);
  const newMult = getUnitMultiplier(newUnit);
  
  experimentalData.value.forEach(row => {
    if (row.vo !== undefined && row.vo !== null) {
      row.vo = parseFloat((row.vo * (oldMult / newMult)).toFixed(6));
    }
  });
  
  globalVoUnit.value = newUnit;
}

function applyCalibrationFactor(factor: number) {
  experimentalData.value.forEach(row => {
    if (row.vo !== undefined && row.vo !== null) {
      row.vo = parseFloat((row.vo * factor).toFixed(6));
    }
  });
  showToast(`Calibração aplicada: Valores Vo multiplicados por ${factor}x`, "success");
}

function generateDecades(startFreq: number, endFreq: number, pointsPerDecade: number) {
  if (startFreq <= 0 || endFreq <= startFreq) {
    showToast("Frequências inválidas para geração.", "error");
    return;
  }
  
  const newPoints: number[] = [];
  let currentDecade = Math.pow(10, Math.floor(Math.log10(startFreq)));
  
  while (currentDecade <= endFreq) {
    let steps: number[] = [];
    if (pointsPerDecade === 1) steps = [1];
    else if (pointsPerDecade === 3) steps = [1, 2, 5];
    else if (pointsPerDecade === 9) steps = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    else steps = [1, 2, 5];
    
    for (const step of steps) {
      const f = parseFloat((currentDecade * step).toFixed(2));
      if (f >= startFreq && f <= endFreq) {
        newPoints.push(f);
      }
    }
    currentDecade *= 10;
  }
  
  let addedCount = 0;
  newPoints.forEach(f => {
    const exists = experimentalData.value.find(p => p.freq === f);
    if (!exists) {
      const newId = experimentalData.value.length > 0 ? Math.max(...experimentalData.value.map(d => d.id)) + 1 : 1;
      experimentalData.value.push({
        id: newId,
        freq: f,
        vo: 0,
        phase: null
      });
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    showToast(`${addedCount} frequências geradas com sucesso!`, "success");
  } else {
    showToast("Nenhuma nova frequência foi adicionada (já existem).", "info");
  }
}

function exportCsv() {
  const rows = processedData.value;
  if (rows.length === 0) return;

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += `Vs(Global),${globalVs.value} V\n\n`;
  csvContent += "Frequencia(Hz),Vo(V),Gv(Linear),Av(dB),Fase(Graus),Interpolado\n";

  rows.forEach((r: any) => {
    csvContent += `${r.freq},${r.vo},${r.gvLinear.toFixed(4)},${r.gvDb.toFixed(4)},${r.phase.toFixed(4)},${r.isInterpolated ? 'Sim' : 'Nao'}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "bode_data_circuit_book.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("Tabela exportada com sucesso para CSV!", "success");
}

onMounted(() => {
  isMounted.value = true;
  const loaded = loadStateFromStorage();
  if (loaded && experimentalData.value.length > 0) {
    setTimeout(() => showToast("Sessão anterior restaurada automaticamente.", "info"), 500);
  }
});
</script>

<template>
  <div class="w-full space-y-8 relative">
    <!-- Interface Dashboard Grid -->
    <div class="w-full">
      <DataTable 
        :experimentalData="experimentalData"
        :processedData="processedData"
        :globalVs="globalVs"
        :globalVsUnit="globalVsUnit"
        :globalVoUnit="globalVoUnit"
        :maxGvDb="maxGvDb"
        :closestToCutoffId="closestToCutoffId"
        @updateRow="updateRow"
        @deleteRow="deleteRow"
        @addRow="addRow"
        @clearTable="clearTable"
        @updateVs="updateVs"
        @updateVsUnit="updateVsUnit"
        @updateVoUnit="updateVoUnit"
        @applyCalibration="applyCalibrationFactor"
        @generateDecades="generateDecades"
        @exportCsv="exportCsv"
        @importCsv="handleImportCsv"
      />
    </div>

    <!-- Equations and Scientific Foundations Details -->
    <div class="w-full" v-if="experimentalData.length > 0">
      <EquationCard 
        :selectedPoint="selectedPoint"
        :fc="analysisResult ? analysisResult.fc : null"
        :maxGvDb="maxGvDb"
        :detectedFilter="analysisResult ? analysisResult.detectedFilter : 'lowpass'"
        :detectedOrder="analysisResult ? analysisResult.detectedOrder : 1"
        :globalVs="globalVs"
        :globalVsUnit="globalVsUnit"
        :isOpamp="false"
      />
    </div>

    <!-- Graphics and Plots (Full Width) -->
    <div class="w-full">
      <ChartsPanel 
        :processedData="processedData"
        :cutoffFrequency="cutoffFrequency"
      />
    </div>

    <!-- Native Vue Confirm Modal -->
    <Teleport to="body" v-if="isMounted">
      <Transition name="fade">
        <div v-if="isConfirmModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center">
          <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" @click="closeConfirm"></div>
          <Transition name="scale">
            <div v-if="isConfirmModalOpen" class="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-6 rounded-lg shadow-2xl w-full max-w-sm">
              <h3 class="text-lg font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                <span class="material-symbols-outlined text-rose-500">warning</span> 
                {{ confirmModalTitle }}
              </h3>
              <p class="text-sm text-slate-600 dark:text-slate-400 mb-6 font-sans leading-relaxed">
                {{ confirmModalMessage }}
              </p>
              <div class="flex justify-end gap-3">
                <button @click="closeConfirm" type="button" class="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded transition-colors">
                  Cancelar
                </button>
                <button @click="handleConfirm" type="button" class="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 rounded shadow-sm transition-colors">
                  Confirmar
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- Native Vue Toasts -->
    <Teleport to="body" v-if="isMounted">
      <div class="fixed bottom-4 right-4 z-[200] flex flex-col gap-2">
        <TransitionGroup name="toast">
          <div 
            v-for="toast in toasts" 
            :key="toast.id" 
            :class="[
              'px-4 py-2.5 rounded border shadow-2xl backdrop-blur-md flex items-center gap-2 text-sm font-medium',
              toast.type === 'success' ? 'bg-emerald-950 border-emerald-500/50 text-emerald-400' :
              toast.type === 'error' ? 'bg-rose-950 border-rose-500/50 text-rose-400' :
              'bg-slate-800/95 border-slate-600/50 text-slate-200'
            ]"
          >
            <span class="material-symbols-outlined text-[18px]">
              {{ toast.type === 'success' ? 'check_circle' : toast.type === 'error' ? 'error' : 'info' }}
            </span> 
            {{ toast.message }}
          </div>
        </TransitionGroup>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* Modal Fade Transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Modal Scale Transition */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Toast Transition */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
