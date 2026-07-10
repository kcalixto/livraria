import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Pedidos } from './Pedidos';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, description: '', amount: 3, status: 'disponível', image_url: 'x' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, description: '', amount: 3, status: 'disponível', image_url: 'x' },
];

const orderLine = (over: Record<string, unknown>) => ({
  id: 'p1',
  book_id: 'b1',
  name: 'Camarada Rosa',
  contact: '(11) 9 8888-0000',
  amount: 1,
  region: 'SP, Capital - Zona Sul',
  status: 'waiting-payment',
  created_at: '2026-07-09T14:00:00.000Z',
  updated_at: '2026-07-09T14:00:00.000Z',
  ...over,
});

function stubFetchRouting(lines: Array<Record<string, unknown>>) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PATCH') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    if (u.includes('/livros')) {
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    }
    const status = new URL(u).searchParams.get('status');
    return Promise.resolve(
      new Response(JSON.stringify(lines.filter((l) => l.status === status)), { status: 200 }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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

describe('Backoffice — Pedidos', () => {
  it('agrupa linhas do mesmo pedido num card com titulo, valor e status por linha', async () => {
    stubFetchRouting([
      orderLine({ book_id: 'b1', status: 'waiting-payment' }),
      orderLine({ book_id: 'b2', status: 'payment-received', amount: 2 }),
    ]);
    renderPage();

    expect(await screen.findByText('Camarada Rosa')).toBeInTheDocument();
    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.getByText('Esperando pagamento')).toBeInTheDocument();
    expect(screen.getByText('Pagamento efetuado')).toBeInTheDocument();
    // total = 4200 + 2*3800 = 11800
    expect(screen.getByText('R$ 118,00')).toBeInTheDocument();
  });

  it('avançar status chama PATCH com book_id da linha', async () => {
    const fetchMock = stubFetchRouting([orderLine({ book_id: 'b1', status: 'waiting-payment' })]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: /confirmar pagamento/i }));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const [url, init] = patchCall as [string, RequestInit];
    expect(url).toMatch(/\/backoffice\/pedidos\/p1\/status$/);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-abc');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'payment-received', book_id: 'b1' });
  });

  it('pedido com todas as linhas entregues não aparece em Pedidos', async () => {
    stubFetchRouting([orderLine({ book_id: 'b1', status: 'received' })]);
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
