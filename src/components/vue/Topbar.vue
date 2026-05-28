<script setup lang="ts">
import { ref, onMounted } from 'vue';

const userData = ref({
  name: "Reinaldo",
  avatar_url: "https://github.com/mr-reinaldo.png",
  bio: "Sistemas de Telecomunicações - IFPB",
  html_url: "https://github.com/mr-reinaldo"
});

const isDarkTheme = ref(true);

onMounted(async () => {
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
  <header class="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dark:shadow-md transition-colors duration-300">
    <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
      
      <!-- Brand Logo -->
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded bg-indigo-600 font-mono text-xl font-black text-white shadow-sm">
          CB
        </div>
        <div>
          <h1 class="text-base font-bold tracking-tight text-slate-900 dark:text-white sm:text-lg">
            Circuit Book
          </h1>
          <p class="text-[10px] font-medium tracking-wide text-indigo-400 uppercase font-mono">
            IFPB · Telecomunicações
          </p>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="hidden md:flex items-center gap-6">
        <!-- Como o base URL pode não estar disponível via import.meta.env no Vue da mesma forma que no Astro SSG, hardcodamos de acordo com a configuração -->
        <a href="/circuit-book/" class="text-sm font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors py-1">
          Analisador
        </a>
        <a href="/circuit-book/sobre" class="text-sm font-medium text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors py-1">
          Sobre
        </a>
      </nav>

      <!-- Actions Area -->
      <div class="flex items-center gap-4">
        
        <!-- Theme Toggle -->
        <button 
          @click="toggleTheme"
          type="button" 
          class="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          title="Alternar Tema Claro/Escuro"
        >
          <span class="material-symbols-outlined text-[20px]">{{ isDarkTheme ? 'light_mode' : 'dark_mode' }}</span>
        </button>

        <!-- Developer GitHub Profile -->
        <a 
          :href="userData.html_url" 
          target="_blank" 
          rel="noopener noreferrer" 
          class="group flex items-center gap-3 rounded bg-slate-100 dark:bg-slate-800 p-1.5 pr-3 hover:bg-slate-200 dark:hover:bg-slate-700 shadow-sm transition-all duration-200"
          title="Ver perfil do desenvolvedor no GitHub"
        >
          <img 
            :src="userData.avatar_url" 
            :alt="`Avatar de ${userData.name}`" 
            class="h-8 w-8 rounded object-cover transition-all duration-200"
            @error="(e) => (e.target as HTMLImageElement).src = 'https://avatars.githubusercontent.com/u/9919?v=4'"
          />
          <div class="hidden sm:block text-left">
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors leading-tight">
              {{ userData.name }}
            </p>
            <p class="text-[9px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[130px]">
              {{ userData.bio }}
            </p>
          </div>
        </a>
      </div>

    </div>
  </header>
</template>
