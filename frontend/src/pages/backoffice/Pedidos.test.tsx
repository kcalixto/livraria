import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Pedidos } from './Pedidos';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, description: '', amount: 3, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, description: '', amount: 3, status: 'disponível' },
];

interface UnitItem {
  unit_id: string;
  title_id: string;
  status: string;
}

function order(id: string, items: UnitItem[], over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Camarada Rosa',
    contact: '(11) 9 8888-0000',
    region: 'SP, Capital - Zona Sul',
    created_at: '2026-07-09T14:00:00.000Z',
    items,
    ...over,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(orders: unknown[]) {
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    if (u.includes('/backoffice/pedidos')) {
      return Promise.resolve(new Response(JSON.stringify(orders), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/pedidos']}>
      <Routes>
        <Route path="/backoffice" element={<div>LOGIN PAGE</div>} />
        <Route path="/backoffice/pedidos" element={<Pedidos />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Backoffice — Pedidos (linhas por unidade)', () => {
  it('duas unidades do MESMO título renderizam duas linhas', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b1', status: 'waiting-payment' },
      ]),
    ]);
    renderPage();

    expect(await screen.findByText('Camarada Rosa')).toBeInTheDocument();
    expect(screen.getAllByText('A Comuna e o Fogo')).toHaveLength(2);
    // total do pedido = 2 × 42,00
    expect(screen.getByText('R$ 84,00')).toBeInTheDocument();
    // valor de cada linha = preço unitário
    expect(screen.getAllByText('R$ 42,00')).toHaveLength(2);
  });

  it('avançar status chama PATCH com o unit_id da linha', async () => {
    stubFetch([
      order('PED001', [
        { unit_id: 'u1', title_id: 'b1', status: 'waiting-payment' },
        { unit_id: 'u2', title_id: 'b2', status: 'payment-received' },
      ]),
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /enviar p\/ entrega/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const [url, init] = patchCall as [string, RequestInit];
    expect(url).toMatch(/\/backoffice\/pedidos\/PED001\/status$/);
    expect(JSON.parse(init.body as string)).toEqual({
      status: 'sent-to-delivery',
      unit_id: 'u2',
    });
  });

  it('pedido com todas as unidades entregues não aparece em Pedidos', async () => {
    stubFetch([
      order('PED001', [{ unit_id: 'u1', title_id: 'b1', status: 'received' }]),
    ]);
    renderPage();

    expect(await screen.findByText(/nenhum pedido pendente/i)).toBeInTheDocument();
  });

  it('token expirado (401): limpa token e volta pro login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (String(url).includes('/backoffice/')) {
          return Promise.resolve(new Response('{}', { status: 401 }));
        }
        return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
      }),
    );
    renderPage();

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBeNull();
  });
});
