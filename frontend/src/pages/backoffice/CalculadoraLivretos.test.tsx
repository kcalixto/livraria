import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CalculadoraLivretos,
  calcItem,
  calcTotals,
  costPerSheet,
  type CalcConfig,
} from './CalculadoraLivretos';

const CONFIG_KEY = 'livraria:calculadora-livretos';
const ITEMS_KEY = 'livraria:calculadora-livretos:itens';

// pacote 500 folhas R$ 25,00 (5¢/folha) + refil R$ 60,00 p/ 1000 folhas (6¢/folha)
const config: CalcConfig = {
  sheetsPerPack: 500,
  packPriceCents: 2500,
  inkRefillPriceCents: 6000,
  sheetsPerRefill: 1000,
};

afterEach(() => {
  localStorage.clear();
});

describe('cálculo', () => {
  it('custo por folha soma papel e tinta', () => {
    expect(costPerSheet(config)).toBeCloseTo(11);
  });

  it('4 páginas = 1 folha; páginas sobrando arredondam pra cima', () => {
    const r = calcItem(config, { id: 'a', pages: 18, priceCents: 500, qty: 1 });
    expect(r.sheets).toBe(5);
    expect(r.unitCostCents).toBe(55);
    expect(r.unitMarginCents).toBe(445);
    expect(r.marginPercent).toBeCloseTo(89);
  });

  it('totais somam receita, custo e margem considerando a quantidade', () => {
    const t = calcTotals(config, [
      { id: 'a', pages: 16, priceCents: 500, qty: 2 }, // custo 44 cada
      { id: 'b', pages: 8, priceCents: 300, qty: 1 }, // custo 22
    ]);
    expect(t.revenueCents).toBe(1300);
    expect(t.costCents).toBe(110);
    expect(t.marginCents).toBe(1190);
    expect(t.marginPercent).toBeCloseTo((1190 / 1300) * 100);
  });
});

async function fillConfig(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /configuração/i }));
  const dialog = screen.getByRole('dialog');
  await user.type(within(dialog).getByLabelText(/folhas no pacote/i), '500');
  await user.type(within(dialog).getByLabelText(/preço do pacote/i), '25,00');
  await user.type(within(dialog).getByLabelText(/preço do refil/i), '60,00');
  await user.type(within(dialog).getByLabelText(/folhas por refil/i), '1000');
  await user.click(within(dialog).getByRole('button', { name: /salvar/i }));
}

async function addItem(
  user: ReturnType<typeof userEvent.setup>,
  pages: string,
  price: string,
  qty?: string,
) {
  await user.type(screen.getByLabelText(/nº de páginas/i), pages);
  await user.type(screen.getByLabelText(/valor de venda/i), price);
  if (qty) {
    const q = screen.getByLabelText(/quantidade/i);
    await user.clear(q);
    await user.type(q, qty);
  }
  await user.click(screen.getByRole('button', { name: /adicionar/i }));
}

describe('<CalculadoraLivretos />', () => {
  it('salva a configuração no localStorage e lê de volta ao remontar', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CalculadoraLivretos />);
    await fillConfig(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CONFIG_KEY)!)).toEqual(config);
    unmount();

    render(<CalculadoraLivretos />);
    await user.click(screen.getByRole('button', { name: /configuração/i }));
    expect(screen.getByLabelText(/folhas no pacote/i)).toHaveValue('500');
    expect(screen.getByLabelText(/preço do refil/i)).toHaveValue('60,00');
  });

  it('adiciona itens, mostra totais e persiste a lista', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    const user = userEvent.setup();
    const { unmount } = render(<CalculadoraLivretos />);
    await addItem(user, '16', '5,00', '2');
    await addItem(user, '8', '3,00');

    const totals = screen.getByRole('region', { name: /totais/i });
    expect(within(totals).getByText('R$ 13,00')).toBeInTheDocument();
    expect(within(totals).getByText('R$ 1,10')).toBeInTheDocument();
    expect(within(totals).getByText('R$ 11,90')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ITEMS_KEY)!)).toHaveLength(2);
    unmount();

    render(<CalculadoraLivretos />);
    expect(screen.getAllByRole('button', { name: 'Remover item' })).toHaveLength(2);
  });

  it('remover item atualiza os totais e o localStorage', async () => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(
      ITEMS_KEY,
      JSON.stringify([
        { id: 'a', pages: 16, priceCents: 500, qty: 2 },
        { id: 'b', pages: 8, priceCents: 300, qty: 1 },
      ]),
    );
    const user = userEvent.setup();
    render(<CalculadoraLivretos />);
    await user.click(screen.getAllByRole('button', { name: 'Remover item' })[0]);

    const totals = screen.getByRole('region', { name: /totais/i });
    expect(within(totals).getByText('R$ 3,00')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(ITEMS_KEY)!)).toEqual([
      { id: 'b', pages: 8, priceCents: 300, qty: 1 },
    ]);
  });

  it('sem configuração mostra aviso', () => {
    render(<CalculadoraLivretos />);
    expect(screen.getByText(/configure o pacote de folhas/i)).toBeInTheDocument();
  });
});
