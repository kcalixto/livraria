import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PedidoEdit } from './PedidoEdit';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, social_price: 3000, amount: 3, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, social_price: 2000, amount: 1, status: 'disponível' },
];

const pedido = {
  id: 'PED001',
  name: 'Camarada Rosa',
  contact: '(planilha)',
  region: 'SP, Capital - Zona Sul',
  created_at: '2026-07-13T14:00:00.000Z',
  ordered_at: '2026-03-01T12:00:00.000Z',
  items: [
    { unit_id: 'u1', title_id: 'b1', status: 'payment-received', picked_up: true, received_amount: 1000 },
    { unit_id: 'u2', title_id: 'b2', status: 'waiting-payment' },
  ],
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'PUT' || init?.method === 'DELETE') {
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }
    if (u.includes('/backoffice/pedidos')) {
      return Promise.resolve(new Response(JSON.stringify([pedido]), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/pedidos/PED001/editar']}>
      <Routes>
        <Route path="/backoffice/pedidos" element={<div>LISTA PEDIDOS</div>} />
        <Route path="/backoffice/pedidos/:id/editar" element={<PedidoEdit />} />
        <Route path="/backoffice/pedidos/:id/itens/:unitId/editar" element={<div>EDITAR ITEM</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe('Backoffice — Editar pedido', () => {
  it('carrega cliente e pedido em; salva via PUT sem tocar created/updated_at', async () => {
    renderPage();

    const nome = await screen.findByLabelText(/cliente/i);
    expect(nome).toHaveValue('Camarada Rosa');
    expect(screen.getByLabelText(/pedido em/i)).toHaveValue('2026-03-01');

    await userEvent.clear(nome);
    await userEvent.type(nome, 'Rosa Corrigida');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT');
    expect(String(put![0])).toMatch(/\/backoffice\/pedidos\/PED001$/);
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({
      name: 'Rosa Corrigida',
      ordered_at: '2026-03-01',
    });
    expect(await screen.findByText('LISTA PEDIDOS')).toBeInTheDocument();
  });

  it('lista os itens com capa, título e valor; clicar navega pra edição do item', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    expect(document.querySelectorAll('.bo-livros__cover')).toHaveLength(2);
    expect(screen.getByText('R$ 10,00')).toBeInTheDocument(); // received_amount da u1
    expect(screen.getByText('R$ 38,00')).toBeInTheDocument(); // preço da u2

    await userEvent.click(screen.getByText('O Pão e as Rosas'));
    expect(await screen.findByText('EDITAR ITEM')).toBeInTheDocument();
  });

  it('Deletar pedido: modal irreversível com alerta; confirmar faz DELETE e sai', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    await userEvent.click(screen.getByRole('button', { name: /deletar pedido/i }));
    // ainda não deletou; o modal descreve a irreversibilidade
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0);
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toMatch(/não é reversível/i);
    expect(dialog.querySelector('.danger-modal__description')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const del = fetchMock.mock.calls.find(([, i]) => i?.method === 'DELETE');
    expect(String(del![0])).toMatch(/\/backoffice\/pedidos\/PED001$/);
    expect(await screen.findByText('LISTA PEDIDOS')).toBeInTheDocument();
  });
});
