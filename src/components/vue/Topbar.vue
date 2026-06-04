<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  pathname?: string;
}>();

const userData = ref({
  name: "Reinaldo",
  avatar_url: "https://github.com/mr-reinaldo.png",
  bio: "Sistemas de Telecomunicações - IFPB",
  html_url: "https://github.com/mr-reinaldo"
});

const isDarkTheme = ref(true);
const currentPath = ref(props.pathname || '');
const isMobileMenuOpen = ref(false);

const isActive = (path: string): boolean => {
  // Obter o pathname atual e normalizar
  let current = currentPath.value.toLowerCase().trim();
  
  // Normalizar o path recebido
  let target = path.toLowerCase().trim();
  
  // Remover barras duplicadas ou no final para comparação
  const normalize = (p: string) => {
    let res = p;
    // Garante que começa com barra se não for vazio
    if (res && !res.startsWith('/')) res = '/' + res;
    // Remove barra final
    res = res.replace(/\/$/, '');
    // Se sobrar apenas vazio, vira '/'
    return res || '/';
  };
  
  const normCurrent = normalize(current);
  const normTarget = normalize(target);
  
  // Tratamento especial para a raiz/página inicial dos passivos
  if (normTarget === '/circuit-book' || normTarget === '/') {
    return normCurrent === '/circuit-book' || 
           normCurrent === '/' || 
           normCurrent === '/circuit-book/index.html' || 
           normCurrent === '/index.html';
  }
  
  return normCurrent === normTarget || 
         normCurrent === normTarget + '.html' || 
         normCurrent === normTarget + '/index.html' ||
         normCurrent.endsWith(normTarget);
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
    currentPath.value = window.location.pathname;
  }

  // Inicialização do Tema
  const storedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
  isDarkTheme.value = storedTheme === 'dark' || (storedTheme === null); // O padrão é dark

  // Fetch GitHub User Data
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch("https://api.github.com/users/mr-reinaldo", {
      headers: {
        "User-Agent": "Astro-CircuitBook-App"
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      userData.value = {
        name: data.name || "Reinaldo",
        avatar_url: data.avatar_url || "https://github.com/mr-reinaldo.png",
        bio: data.bio || "Sistemas de Telecomunicações - IFPB",
        html_url: data.html_url || "https://github.com/mr-reinaldo"
      };
    }
  } catch (e) {
    // Falha silenciosa (timeout ou offline) - mantém o fallback state
  }
});

const toggleTheme = () => {
  isDarkTheme.value = !isDarkTheme.value;
  if (isDarkTheme.value) {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  }
  localStorage.setItem('theme', isDarkTheme.value ? 'dark' : 'light');
  
  // Dispatch a custom event so Chart.js can update its colors dynamically
  window.dispatchEvent(new CustomEvent('theme-changed', { detail: { isDark: isDarkTheme.value } }));
};
</script>

<template>
  <header class="sticky top-0 z-50 w-full" style="background:var(--surface-card);border-bottom:1px solid var(--border-subtle);box-shadow:var(--shadow-sm)">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      
      <!-- Brand Logo -->
      <a href="/circuit-book/" class="flex items-center gap-3 cursor-pointer select-none group">
        <div class="flex h-10 w-10 items-center justify-center rounded font-mono text-xl font-black text-white shadow-sm transition-transform duration-200 group-hover:scale-[1.03]" style="background:var(--primary)">
          CB
        </div>
        <div>
          <h1 class="text-base font-bold tracking-tight sm:text-lg transition-colors" style="color:var(--text-primary)">
            Circuit Book
          </h1>
          <p class="text-[10px] font-medium tracking-wide uppercase font-mono" style="color:var(--primary-text)">
            IFPB · Telecomunicações
          </p>
        </div>
      </a>

      <!-- Navigation Links -->
      <nav class="hidden md:flex items-center gap-6 h-full">
        <a 
          href="/circuit-book/" 
          class="text-sm py-1.5 transition-colors relative h-full flex items-center px-1 font-sans"
          :class="isActive('/circuit-book/') ? 'font-bold' : 'font-semibold'"
          :style="isActive('/circuit-book/') ? 'color:var(--primary)' : 'color:var(--text-secondary)'"
        >
          Filtros Passivos
          <span 
            v-if="isActive('/circuit-book/')" 
            class="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full shadow-[0_-2px_10px_rgba(13,148,136,0.5)]" 
            style="background:var(--primary)"
          ></span>
        </a>
        <a 
          href="/circuit-book/opamp" 
          class="text-sm py-1.5 transition-colors relative h-full flex items-center px-1 font-sans"
          :class="isActive('/circuit-book/opamp') ? 'font-bold' : 'font-semibold'"
          :style="isActive('/circuit-book/opamp') ? 'color:var(--primary)' : 'color:var(--text-secondary)'"
        >
          Filtros Ativos
          <span 
            v-if="isActive('/circuit-book/opamp')" 
            class="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full shadow-[0_-2px_10px_rgba(13,148,136,0.5)]" 
            style="background:var(--primary)"
          ></span>
        </a>
        <a 
          href="/circuit-book/projeto-passivo" 
          class="text-sm py-1.5 transition-colors relative h-full flex items-center px-1 font-sans"
          :class="isActive('/circuit-book/projeto-passivo') ? 'font-bold' : 'font-semibold'"
          :style="isActive('/circuit-book/projeto-passivo') ? 'color:var(--primary)' : 'color:var(--text-secondary)'"
        >
          Projeto (Passivos)
          <span 
            v-if="isActive('/circuit-book/projeto-passivo')" 
            class="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full shadow-[0_-2px_10px_rgba(13,148,136,0.5)]" 
            style="background:var(--primary)"
          ></span>
        </a>
        <a 
          href="/circuit-book/projeto" 
          class="text-sm py-1.5 transition-colors relative h-full flex items-center px-1 font-sans"
          :class="isActive('/circuit-book/projeto') ? 'font-bold' : 'font-semibold'"
          :style="isActive('/circuit-book/projeto') ? 'color:var(--primary)' : 'color:var(--text-secondary)'"
        >
          Projeto (Ativos)
          <span 
            v-if="isActive('/circuit-book/projeto')" 
            class="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full shadow-[0_-2px_10px_rgba(13,148,136,0.5)]" 
            style="background:var(--primary)"
          ></span>
        </a>
      </nav>

      <!-- Actions Area -->
      <div class="flex items-center gap-1 sm:gap-3">
        
        <!-- About Page Icon -->
        <a 
          href="/circuit-book/sobre"
          class="rounded-md p-2 transition-colors flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5"
          :style="isActive('/circuit-book/sobre') ? 'color:var(--primary)' : 'color:var(--text-secondary)'"
          title="Sobre o Circuit Book"
        >
          <span class="material-symbols-outlined text-[20px]">{{ isActive('/circuit-book/sobre') ? 'info' : 'info' }}</span>
        </a>

        <!-- Theme Toggle -->
        <button 
          @click="toggleTheme"
          type="button" 
          class="rounded-md p-2 transition-colors flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/5" style="color:var(--text-secondary)"
          title="Alternar Tema Claro/Escuro"
        >
          <span class="material-symbols-outlined text-[20px]">{{ isDarkTheme ? 'light_mode' : 'dark_mode' }}</span>
        </button>

        <!-- Developer GitHub Profile -->
        <a 
          :href="userData.html_url" 
          target="_blank" 
          rel="noopener noreferrer" 
          class="group flex items-center gap-2 rounded p-1 shadow-sm transition-all duration-200" style="background:var(--surface-input);border:1px solid var(--border-subtle)"
          title="Ver perfil do desenvolvedor no GitHub"
        >
          <img 
            :src="userData.avatar_url" 
            :alt="`Avatar de ${userData.name}`" 
            class="h-7 w-7 rounded object-cover transition-all duration-200"
            @error="(e) => (e.target as HTMLImageElement).src = 'https://avatars.githubusercontent.com/u/9919?v=4'"
          />
          <div class="hidden sm:block text-left max-w-[100px]">
            <p class="text-[10px] font-semibold transition-colors leading-tight truncate" style="color:var(--text-primary)">
              {{ userData.name }}
            </p>
            <p class="text-[8px] font-mono truncate" style="color:var(--text-tertiary)">
              {{ userData.bio }}
            </p>
          </div>
        </a>

        <!-- Mobile Menu Hamburger Button -->
        <button 
          @click="isMobileMenuOpen = !isMobileMenuOpen"
          type="button" 
          class="md:hidden rounded-md p-1.5 transition-colors focus:outline-none cursor-pointer" style="color:var(--text-secondary)"
          aria-label="Abrir Menu"
        >
          <span class="material-symbols-outlined text-[24px]">
            {{ isMobileMenuOpen ? 'close' : 'menu' }}
          </span>
        </button>
      </div>

    </div>

    <!-- Mobile Navigation Drawer -->
    <Transition name="slide-fade">
      <div 
        v-if="isMobileMenuOpen" 
        class="md:hidden w-full border-t border-(--border-subtle) px-4 py-3 space-y-1.5 flex flex-col transition-all duration-300"
        style="background:var(--surface-card);"
      >
        <a 
          href="/circuit-book/" 
          class="text-xs font-bold px-4 py-3 rounded-lg flex items-center justify-between transition-all"
          :style="isActive('/circuit-book/') ? 'background:var(--primary-surface); color:var(--primary)' : 'color:var(--text-secondary)'"
          @click="isMobileMenuOpen = false"
        >
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">motion_photos_off</span>
            Filtros Passivos
          </span>
          <span v-if="isActive('/circuit-book/')" class="material-symbols-outlined text-[18px]">check_small</span>
        </a>
        <a 
          href="/circuit-book/opamp" 
          class="text-xs font-bold px-4 py-3 rounded-lg flex items-center justify-between transition-all"
          :style="isActive('/circuit-book/opamp') ? 'background:var(--primary-surface); color:var(--primary)' : 'color:var(--text-secondary)'"
          @click="isMobileMenuOpen = false"
        >
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">electric_bolt</span>
            Filtros Ativos
          </span>
          <span v-if="isActive('/circuit-book/opamp')" class="material-symbols-outlined text-[18px]">check_small</span>
        </a>
        <a 
          href="/circuit-book/projeto-passivo" 
          class="text-xs font-bold px-4 py-3 rounded-lg flex items-center justify-between transition-all"
          :style="isActive('/circuit-book/projeto-passivo') ? 'background:var(--primary-surface); color:var(--primary)' : 'color:var(--text-secondary)'"
          @click="isMobileMenuOpen = false"
        >
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">architecture</span>
            Projeto (Passivos)
          </span>
          <span v-if="isActive('/circuit-book/projeto-passivo')" class="material-symbols-outlined text-[18px]">check_small</span>
        </a>
        <a 
          href="/circuit-book/projeto" 
          class="text-xs font-bold px-4 py-3 rounded-lg flex items-center justify-between transition-all"
          :style="isActive('/circuit-book/projeto') ? 'background:var(--primary-surface); color:var(--primary)' : 'color:var(--text-secondary)'"
          @click="isMobileMenuOpen = false"
        >
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">architecture</span>
            Projeto (Ativos)
          </span>
          <span v-if="isActive('/circuit-book/projeto')" class="material-symbols-outlined text-[18px]">check_small</span>
        </a>
        <a 
          href="/circuit-book/sobre" 
          class="text-xs font-bold px-4 py-3 rounded-lg flex items-center justify-between transition-all"
          :style="isActive('/circuit-book/sobre') ? 'background:var(--primary-surface); color:var(--primary)' : 'color:var(--text-secondary)'"
          @click="isMobileMenuOpen = false"
        >
          <span class="flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px]">help</span>
            Sobre
          </span>
          <span v-if="isActive('/circuit-book/sobre')" class="material-symbols-outlined text-[18px]">check_small</span>
        </a>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: all 0.2s ease-out;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
