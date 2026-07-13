import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Vendas } from './Vendas';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, description: '', amount: 3, status: 'disponível' },
];

interface SaleUnit {
  unit_id: string;
  title_id: string;
  status: string;
  picked_up?: boolean;
  received_amount?: number;
  paid_at?: string;
  updated_at?: string;
}

function order(id: string, created_at: string, items: SaleUnit[]) {
  return {
    id,
    name: 'Camarada Rosa',
    contact: '(11) 9 8888-0000',
    region: 'SP, Capital - Zona Sul',
    created_at,
    items,
  };
}

const soldUnit = (over: Partial<SaleUnit> = {}): SaleUnit => ({
  unit_id: `u-${Math.random().toString(36).slice(2, 8)}`,
  title_id: 'b1',
  status: 'received',
  received_amount: 4200,
  paid_at: '2026-07-05T12:00:00.000Z',
  updated_at: '2026-07-10T15:00:00.000Z',
  ...over,
});

let capturedCsv: string | null = null;

function stubFetch(orders: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/backoffice/pedidos')) {
        return Promise.resolve(new Response(JSON.stringify(orders), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    }),
  );
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Vendas />
    </MemoryRouter>,
  );
}

async function setRange(inicio: string, fim: string) {
  const start = await screen.findByLabelText(/de \(mês\)/i);
  const end = screen.getByLabelText(/até \(mês\)/i);
  fireEvent.change(start, { target: { value: inicio } });
  fireEvent.change(end, { target: { value: fim } });
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  capturedCsv = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe('Backoffice — Vendas', () => {
  it('mostra data do pedido e data de finalização por unidade', async () => {
    stubFetch([
      order('PED001', '2026-07-01T10:00:00.000Z', [
        soldUnit({ updated_at: '2026-07-10T15:00:00.000Z' }),
      ]),
    ]);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('A Comuna e o Fogo');
    expect(screen.getByText('01/07 · 7h')).toBeInTheDocument(); // pedido
    expect(screen.getByText('10/07 · 12h')).toBeInTheDocument(); // finalização
  });

  it('mostra o total do período filtrado (Σ recebido)', async () => {
    stubFetch([
      order('PED001', '2026-07-01T10:00:00.000Z', [
        soldUnit({ received_amount: 4200 }),
        soldUnit({ received_amount: 10000 }),
      ]),
    ]);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findAllByText('#PED-001');
    expect(screen.getByText(/2 vendas/i)).toBeInTheDocument();
    expect(screen.getByText('R$ 142,00', { selector: '.sales-summary *' })).toBeInTheDocument();
  });

  it('filtra pelo mês de finalização', async () => {
    stubFetch([
      order('JUNHO1', '2026-06-01T10:00:00.000Z', [
        soldUnit({ updated_at: '2026-06-15T10:00:00.000Z' }),
      ]),
      order('JULHO1', '2026-07-01T10:00:00.000Z', [
        soldUnit({ updated_at: '2026-07-10T10:00:00.000Z' }),
      ]),
    ]);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('#JUL-HO1');
    expect(screen.queryByText('#JUN-HO1')).not.toBeInTheDocument();

    await setRange('2026-06', '2026-07');
    expect(await screen.findByText('#JUN-HO1')).toBeInTheDocument();
  });

  it('busca por id do pedido com ou sem hífen', async () => {
    stubFetch([
      order('VDT2QQ', '2026-07-01T10:00:00.000Z', [soldUnit()]),
      order('AAA111', '2026-07-01T10:00:00.000Z', [soldUnit()]),
    ]);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('#VDT-2QQ');

    await userEvent.type(screen.getByPlaceholderText(/buscar por id/i), 'vdt-2qq');
    expect(screen.getByText('#VDT-2QQ')).toBeInTheDocument();
    expect(screen.queryByText('#AAA-111')).not.toBeInTheDocument();
  });

  it('busca também por cliente e por título', async () => {
    stubFetch([
      order('VDT2QQ', '2026-07-01T10:00:00.000Z', [soldUnit()]),
      order('AAA111', '2026-07-01T10:00:00.000Z', [soldUnit()]),
    ]);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('#VDT-2QQ');

    // por título (as duas vendem o mesmo livro; buscar por cliente diferencia)
    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'comuna');
    expect(screen.getByText('#VDT-2QQ')).toBeInTheDocument();
    expect(screen.getByText('#AAA-111')).toBeInTheDocument();
  });

  it('pagina de 50 em 50', async () => {
    const orders = Array.from({ length: 55 }, (_, i) =>
      order(`P${String(i).padStart(5, '0')}`, '2026-07-01T10:00:00.000Z', [soldUnit()]),
    );
    stubFetch(orders);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('#P00-000');
    expect(document.querySelectorAll('.sales-table__row')).toHaveLength(50);

    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(document.querySelectorAll('.sales-table__row')).toHaveLength(5);
  });

  it('exporta CSV do período completo com data de pagamento', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn().mockReturnValue('blob:fake'),
      revokeObjectURL: vi.fn(),
    });
    const orders = Array.from({ length: 55 }, (_, i) =>
      order(`P${String(i).padStart(5, '0')}`, '2026-07-01T10:00:00.000Z', [
        soldUnit({ received_amount: 10000, paid_at: '2026-07-05T12:00:00.000Z' }),
      ]),
    );
    stubFetch(orders);
    renderPage();

    await setRange('2026-07', '2026-07');
    await screen.findByText('#P00-000');

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        el.click = () => {};
      }
      return el;
    });
    class FakeBlob {
      constructor(parts: string[]) {
        capturedCsv = parts.join('');
      }
    }
    vi.stubGlobal('Blob', FakeBlob as never);

    await userEvent.click(screen.getByRole('button', { name: /exportar csv/i }));
    // cabeçalho com data de pagamento
    expect(capturedCsv).toContain('pedido;cliente;contato;livro;valor_recebido;data_pedido;data_pagamento;data_finalizacao');
    // TODAS as 55 linhas do período, ignorando a paginação
    expect(capturedCsv!.trim().split('\n')).toHaveLength(56);
    expect(capturedCsv).toContain('100,00');
    expect(capturedCsv).toContain('05/07/2026'); // data de pagamento
  });
});
