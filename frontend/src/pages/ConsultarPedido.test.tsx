import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../cart/CartContext';
import { ConsultarPedido } from './ConsultarPedido';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, description: '', amount: 3, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, description: '', amount: 1, status: 'disponível' },
];

const pedido = {
  id: 'AJ3C9K',
  created_at: '2026-07-09T14:00:00.000Z',
  items: [
    { unit_id: 'u1', title_id: 'b1', status: 'sent-to-delivery', observation: 'Sai na quinta com o pessoal do coletivo' },
    { unit_id: 'u2', title_id: 'b2', status: 'payment-received', picked_up: true },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(orderStatus = 200) {
  fetchMock = vi.fn().mockImplementation((url: string) => {
    const u = String(url);
    if (/\/pedidos\/[A-Z0-9]+$/i.test(u)) {
      return Promise.resolve(
        new Response(JSON.stringify(orderStatus === 200 ? pedido : { error: 'not found' }), {
          status: orderStatus,
        }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CartProvider>
        <ConsultarPedido />
      </CartProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => stubFetch());

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Loja — Consultar pedido', () => {
  it('consulta por código (com hífen) e mostra status por unidade + observação', async () => {
    renderPage();

    await userEvent.type(screen.getByLabelText(/código do pedido/i), 'aj3-c9k');
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }));

    expect(await screen.findByText('#AJ3-C9K')).toBeInTheDocument();
    // código enviado sem hífen e maiúsculo
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('/pedidos/AJ3C9K'))).toBe(true);

    expect(screen.getByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText(/enviado para entrega/i)).toBeInTheDocument();
    expect(screen.getByText(/sai na quinta/i)).toBeInTheDocument();
    // picked_up + payment-received exibe como Entregue
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.getByText(/entregue/i)).toBeInTheDocument();
  });

  it('solicitar cancelamento por item: confirma, faz POST e mostra o aviso', async () => {
    fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'POST') {
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'AJ3C9K', unit_id: 'u1', cancel_requested: true }), {
            status: 200,
          }),
        );
      }
      if (/\/pedidos\/[A-Z0-9]+$/i.test(u)) {
        return Promise.resolve(new Response(JSON.stringify(pedido), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.type(screen.getByLabelText(/código do pedido/i), 'AJ3C9K');
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }));
    await screen.findByText('#AJ3-C9K');

    // só o item não finalizado (u1) oferece cancelamento
    const solicitar = screen.getAllByRole('button', { name: /solicitar cancelamento/i });
    expect(solicitar).toHaveLength(1);

    await userEvent.click(solicitar[0]);
    // confirmação antes do POST
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));

    const postCall = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(String(postCall![0])).toMatch(/\/pedidos\/AJ3C9K\/cancelamento$/);
    expect(JSON.parse((postCall![1] as RequestInit).body as string)).toEqual({ unit_id: 'u1' });
    expect(await screen.findByText(/cancelamento solicitado/i)).toBeInTheDocument();
  });

  it('item cancelado aparece como estado final Cancelado, sem botão de solicitar', async () => {
    fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url);
      if (/\/pedidos\/[A-Z0-9]+$/i.test(u)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...pedido,
              items: [{ unit_id: 'u1', title_id: 'b1', status: 'cancelled' }],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.type(screen.getByLabelText(/código do pedido/i), 'AJ3C9K');
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }));

    expect(await screen.findByText('Cancelado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /solicitar cancelamento/i })).not.toBeInTheDocument();
  });

  it('código inexistente mostra erro amigável', async () => {
    stubFetch(404);
    renderPage();

    await userEvent.type(screen.getByLabelText(/código do pedido/i), 'XXXXXX');
    await userEvent.click(screen.getByRole('button', { name: /consultar/i }));

    expect(await screen.findByText(/pedido não encontrado/i)).toBeInTheDocument();
  });
});
