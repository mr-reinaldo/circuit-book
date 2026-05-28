<div align="center">
  
  <br />
  <h1>Circuit Book (ACE)</h1>
  <p><strong>Analisador de Circuitos Eletrônicos</strong></p>
  
  [![Deploy GitHub Pages](https://github.com/mr-reinaldo/circuit-book/actions/workflows/deploy.yml/badge.svg)](https://github.com/mr-reinaldo/circuit-book/actions/workflows/deploy.yml)
  [![Vue 3](https://img.shields.io/badge/Vue.js-35495E?style=flat&logo=vue.js&logoColor=4FC08D)](https://vuejs.org/)
  [![Astro](https://img.shields.io/badge/Astro-0C1120?style=flat&logo=astro&logoColor=white)](https://astro.build/)
  [![D3.js](https://img.shields.io/badge/d3.js-F9A03C?style=flat&logo=d3.js&logoColor=white)](https://d3js.org/)
  [![Licença MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  
  <br />
  <p>
    🚀 <b>Acesse o aplicativo ao vivo:</b> <br />
    <a href="https://mr-reinaldo.github.io/circuit-book"><b>mr-reinaldo.github.io/circuit-book</b></a>
  </p>

</div>

---

## 📖 Sobre o Projeto

O **Circuit Book (ACE)** foi desenvolvido para auxiliar os estudantes do *Curso Superior de Tecnologia em Sistemas de Telecomunicações* do Instituto Federal da Paraíba (IFPB). 

A plataforma substitui planilhas complexas por um ambiente interativo, rápido e focado, projetado para que alunos transcrevam seus dados obtidos em laboratório (osciloscópio) e visualizem **Diagramas de Bode** em tempo real, sem dor de cabeça.

## ✨ Funcionalidades

- **Gráficos Mono-Log Autênticos:** O motor vetorial D3.js renderiza o gráfico com escalas semi-logarítmicas profissionais idênticas ao papel utilizado em laboratórios.
- **Gerador de Décadas:** Preenchimento automático de todo o range de frequências para economizar tempo durante a transcrição de dados.
- **Heurística de Filtros & Fase Teórica:** Se os dados de fase (graus) forem omitidos, o algoritmo deduz o tipo de filtro (Passa-Baixa, Alta, Banda) pelo ganho, e calcula/desenha a curva de fase teórica em background automaticamente!
- **Calibração de Pontas de Prova:** Corrija falhas de leitura sistêmicas (ex: x10, x0.1) instantaneamente no Data Table sem reescrever dados.
- **Exportação Acadêmica:** 
  - Exporte os dados tabelados em `.csv` (Excel).
  - Exporte os gráficos em `.png` de alta resolução para colar direto em relatórios de Física/Eletrônica.

## 🛠️ Tecnologias Utilizadas

O projeto foi construído focando em performance absurda no navegador, utilizando o conceito de *Islands Architecture*:

- [Astro](https://astro.build/) (SSG & Roteamento Global)
- [Vue 3](https://vuejs.org/) (Reatividade do Analisador via Composition API)
- [D3.js](https://d3js.org/) (Data-Driven Documents para renderização vetorial)
- [Tailwind CSS v4](https://tailwindcss.com/) (Design System & Dark Mode Nativo)
- [TypeScript](https://www.typescriptlang.org/) (Superset JavaScript para tipagem segura)
- [Vitest](https://vitest.dev/) (Suíte de testes de unidade automatizados)

## 🚀 Como Rodar Localmente

Se você deseja contribuir ou estudar o código, siga as etapas:

1. **Clone este repositório:**
   ```bash
   git clone https://github.com/mr-reinaldo/circuit-book.git
   cd circuit-book
   ```

2. **Instale as dependências (requer pnpm):**
   ```bash
   pnpm install
   ```

3. **Inicie o servidor de desenvolvimento:**
   ```bash
   pnpm run dev
   ```
   A aplicação rodará em `http://localhost:4321/circuit-book`

4. **Rode os testes:**
   ```bash
   pnpm run test
   ```

## ⚖️ Licença

Este projeto está licenciado sob a **Licença MIT**. Sinta-se livre para utilizar, modificar e distribuir o código. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

> Desenvolvido com ☕ e dedicação no IFPB - Campus João Pessoa.
