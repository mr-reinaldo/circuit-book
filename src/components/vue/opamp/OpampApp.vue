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
const globalVinMode = ref<'vpp' | 'vrms'>('vpp');
const isMounted = ref(false);

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

// Load from local storage on mount
onMounted(() => {
  isMounted.value = true;

  // Ouvir eventos globais de toast para maior desacoplamento de componentes
  window.addEventListener('show-toast', ((e: CustomEvent) => {
    if (e.detail) showToast(e.detail.message, e.detail.type || 'info');
  }) as EventListener);

  const saved = localStorage.getItem('circuit-book-opamp-data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      experimentalData.value = parsed.experimentalData || [];
      globalVinPp.value = parsed.globalVinPp || 1.0;
      globalVinUnit.value = parsed.globalVinUnit || 'V';
      globalVoutUnit.value = parsed.globalVoutUnit || 'V';
      globalVinMode.value = parsed.globalVinMode || 'vpp';
      if (experimentalData.value.length > 0) {
        setTimeout(() => showToast("Sessão anterior de Filtros Ativos restaurada automaticamente.", "info"), 500);
      }
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
    globalVoutUnit.value,
    globalVinMode.value
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
      showToast("Nenhum ponto válido encontrado no arquivo CSV.", "error");
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

    showToast(`CSV importado com sucesso: ${parsed.points.length} pontos carregados.`, "success");
  } catch (err: any) {
    showToast(`Erro de parser CSV: ${err.message}`, "error");
  }
}

const handleUpdateData = (newData: OpampDataPoint[]) => {
  experimentalData.value = newData;
  saveData();
};

const handleRemovePoint = (id: string) => {
  showConfirm(
    'Excluir Ponto',
    'Tem certeza que deseja apagar este ponto da tabela? Isso recalculará os gráficos.',
    () => {
      experimentalData.value = experimentalData.value.filter(p => p.id !== id);
      saveData();
      showToast("Ponto excluído com sucesso.", "success");
    }
  );
};

const handleClearData = () => {
  showConfirm(
    'Limpar Tabela',
    'Tem certeza que deseja apagar TODOS os dados experimentais? Esta ação não pode ser desfeita.',
    () => {
      experimentalData.value = [];
      saveData();
      showToast("Tabela limpa com sucesso.", "info");
    }
  );
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
  
  experimentalData.value = experimentalData.value.map(row => {
    const newRow = { ...row };
    if (newRow.vMax !== null) newRow.vMax = parseFloat((newRow.vMax * (oldMult / newMult)).toFixed(6));
    if (newRow.vMin !== null) newRow.vMin = parseFloat((newRow.vMin * (oldMult / newMult)).toFixed(6));
    return newRow;
  });
  
  globalVoutUnit.value = newUnit;
  saveData();
};

const saveData = () => {
  localStorage.setItem('circuit-book-opamp-data', JSON.stringify({
    experimentalData: experimentalData.value,
    globalVinPp: globalVinPp.value,
    globalVinUnit: globalVinUnit.value,
    globalVoutUnit: globalVoutUnit.value,
    globalVinMode: globalVinMode.value
  }));
};

const exportToCsv = () => {
  const rows = analysisResult.value.processedPoints;
  if (rows.length === 0) {
    showToast("Nenhum dado para exportar!", "error");
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
  
  showToast("Tabela exportada com sucesso para CSV!", "success");
};
</script>

<template>
  <div class="space-y-6">
    <!-- Bench Data Analyzer Tab -->
    <div class="space-y-6">
      <OpampDataTable 
        :experimentalData="experimentalData"
        :processedData="analysisResult.processedPoints"
        :closestToCutoffId="analysisResult.closestToCutoffId"
        :maxGvDb="analysisResult.maxGvDb"
        :globalVinPp="globalVinPp"
        :globalVinUnit="globalVinUnit"
        :globalVoutUnit="globalVoutUnit"
        :amplitudeMode="globalVinMode"
        @updateData="handleUpdateData"
        @removePoint="handleRemovePoint"
        @clearData="handleClearData"
        @updateVinPp="handleUpdateVinPp"
        @updateVinUnit="handleUpdateVinUnit"
        @updateVoutUnit="handleUpdateVoutUnit"
        @updateAmplitudeMode="(mode) => { globalVinMode = mode; saveData(); }"
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
          :amplitudeMode="globalVinMode"
        />
      </div>

      <OpampChartsPanel 
        :processed-data="(analysisResult.processedPoints as any)"
        :cutoff-frequency="analysisResult.cutoffFreq"
      />
    </div>

    <!-- Native Vue Confirm Modal -->
    <Teleport to="body" v-if="isMounted">
      <Transition name="fade">
        <div v-if="isConfirmModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center">
          <div class="absolute inset-0 backdrop-blur-sm" style="background:rgba(0,0,0,0.5)" @click="closeConfirm"></div>
          <Transition name="scale">
            <div v-if="isConfirmModalOpen" class="cb-card relative p-6 w-full max-w-sm" style="box-shadow:0 25px 50px -12px rgba(0,0,0,0.25)">
              <h3 class="text-lg font-bold mb-2 flex items-center gap-2" style="color:var(--text-primary)">
                <span class="material-symbols-outlined" style="color:var(--error-text)">warning</span> 
                {{ confirmModalTitle }}
              </h3>
              <p class="text-sm mb-6 font-sans leading-relaxed" style="color:var(--text-secondary)">
                {{ confirmModalMessage }}
              </p>
              <div class="flex justify-end gap-3">
                <button @click="closeConfirm" type="button" class="cb-btn-outline px-4 py-2">
                  Cancelar
                </button>
                <button @click="handleConfirm" type="button" class="px-4 py-2 text-sm font-bold text-white rounded shadow-sm transition-colors" style="background:var(--error);">
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
              toast.type === 'success' ? 'text-[var(--success-text)]' :
              toast.type === 'error' ? 'text-[var(--error-text)]' :
              ''
            ]"
            :style="toast.type === 'success' ? 'background:var(--success-surface);border-color:rgba(34,197,94,0.3)' : toast.type === 'error' ? 'background:var(--error-surface);border-color:rgba(239,68,68,0.3)' : 'background:var(--surface-card);border-color:var(--border-default);color:var(--text-primary)'"
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
