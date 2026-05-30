import { describe, it, expect, beforeEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import OpampFilterDesigner from './OpampFilterDesigner.vue';

describe('OpampFilterDesigner.vue User Simulation', () => {
  let wrapper: VueWrapper<any>;

  beforeEach(() => {
    // Montar o componente antes de cada teste
    wrapper = mount(OpampFilterDesigner);
  });

  it('Teste 1: Montagem do componente inicial', () => {
    // O componente deve montar e exibir o título padrão
    expect(wrapper.text()).toContain('Filtro Passa-Baixa');
    // Deve exibir as configurações padrão: 1.5k e 22n
    const inputs = wrapper.findAll('input');
    // Encontra o input do Resistor Base e Capacitor
    const rInput = inputs.find((i: any) => i.attributes('placeholder') === 'ex: 1.5k');
    const cInput = inputs.find((i: any) => i.attributes('placeholder') === 'ex: 22n');
    
    expect(rInput).toBeDefined();
    expect(cInput).toBeDefined();
    
    // O cálculo de 1.5k e 22n em Filtro de 2ª Ordem resulta em 1804.7 Hz
    expect(wrapper.text()).toContain('1804.7');
  });

  it('Teste 2: Calculadora de frequência alvo', async () => {
    // Simula o usuário digitando 10k na frequência alvo
    const targetInput = wrapper.findAll('input').find((i: any) => i.attributes('placeholder') === 'ex: 5k');
    expect(targetInput).toBeDefined();
    
    await targetInput!.setValue('10k');
    
    // Simula o clique no botão Calcular
    const calcButton = wrapper.findAll('button').find((b: any) => b.text().includes('Calcular R e C'));
    expect(calcButton).toBeDefined();
    
    await calcButton!.trigger('click');
    
    // Agora o resistor e capacitor devem ter sido atualizados magicamente para valores comerciais!
    // A frequência 10k geralmente dá 1kΩ e 15nF ou similar (10610 Hz)
    // Verificamos apenas se a frequência calculada no SVG não é mais 4.8 kHz e chegou próximo a 10kHz
    expect(wrapper.text()).not.toContain('4.8 kHz');
    expect(wrapper.text()).toContain('10.'); // ex: 10.6 kHz
  });

  it('Teste 3: Alterações nos inputs manuais', async () => {
    // Vamos alterar o Capacitor manualmente de 22n para 220n
    const inputs = wrapper.findAll('input');
    const cInput = inputs[1]; // assumindo que o capacitor é o segundo
    
    await cInput.setValue('220n');
    
    expect(wrapper.text()).not.toContain('1804.7 Hz');
  });

  it('Teste 4: Comboboxes de tipos e ordem de filtros', async () => {
    const buttons = wrapper.findAll('button');
    const highpassBtn = buttons.find((b: any) => b.text().includes('Passa-Altas'));
    const order1Btn = buttons.find((b: any) => b.text().includes('1ª Ordem'));
    
    // Muda para Passa-Alta
    await highpassBtn!.trigger('click');
    expect(wrapper.text()).toContain('Cascata RC de 2a Ordem (HPF)');
    expect(wrapper.text()).toContain('40 dB/década'); // Rolloff positivo (em 2ª ordem) sem sinal de +
    
    // Muda para 1ª Ordem
    await order1Btn!.trigger('click');
    expect(wrapper.text()).toContain('1ª Ordem');
    expect(wrapper.text()).toContain('20 dB/década'); // Cai pela metade o Rolloff
  });

  it('Teste 5: Ganho e limite de saturação', async () => {
    const inputs = wrapper.findAll('input');
    // R3 (Feedback) e R4 (Ground) controlam o ganho não inversor
    const r3Input = inputs.find((i: any) => i.attributes('placeholder') === 'ex: 10k'); // R3
    const r4Input = inputs.find((i: any) => i.attributes('placeholder') === 'ex: 1k'); // R4
    
    // Ganho padrão: 1 + (10k/1k) = 11
    expect(wrapper.text()).toContain('11.000');
    
    // Altera R3 para 4k
    await r3Input!.setValue('4k');
    // Novo ganho: 1 + (4k/1k) = 5
    expect(wrapper.text()).toContain('5.000');
    
    // Altera Fonte Positiva para 5V
    const vpInput = inputs.find((i: any) => i.attributes('placeholder') === 'ex: 12');
    await vpInput!.setValue('5');
    
    // Verifica se os textos do painel refletem os limites de 5V na saturação
    expect(wrapper.text()).toContain('5V');
  });
});
