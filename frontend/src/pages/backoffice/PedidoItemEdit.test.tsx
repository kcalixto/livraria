import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PedidoItemEdit } from './PedidoItemEdit';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, social_price: 3000, amount: 3, status: 'disponível' },
];

const pedido = {
  id: 'PED001',
  name: 'Camarada Rosa',
  contact: '(planilha)',
  region: 'SP, Capital - Zona Sul',
  created_at: '2026-07-13T14:00:00.000Z',
  ordered_at: '2026-03-01T12:00:00.000Z',
  items: [
    {
      unit_id: 'u1',
      title_id: 'b1',
      status: 'payment-received',
      picked_up: true,
      received_amount: 1000,
      finalized_at: '2026-04-05T12:00:00.000Z',
      observation: 'obs antiga',
    },
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
    <MemoryRouter initialEntries={['/backoffice/pedidos/PED001/itens/u1/editar']}>
      <Routes>
        <Route path="/backoffice/pedidos/:id/editar" element={<div>EDITAR PEDIDO</div>} />
        <Route path="/backoffice/pedidos/:id/itens/:unitId/editar" element={<PedidoItemEdit />} />
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

describe('Backoffice — Editar item do pedido', () => {
  it('mostra dados globais e carrega os campos da unidade; salva via PUT', async () => {
    renderPage();

    // dados globais read-only
    expect(await screen.findByText('#PED-001')).toBeInTheDocument();
    expect(screen.getByText('Camarada Rosa')).toBeInTheDocument();

    const valor = screen.getByLabelText(/valor pago/i);
    expect(valor).toHaveValue('10,00');
    expect(screen.getByLabelText(/finalizado em/i)).toHaveValue('2026-04-05');
    expect(screen.getByLabelText(/^status$/i)).toHaveValue('payment-received');
    expect(screen.getByLabelText(/preço social/i)).not.toBeChecked();
    expect(screen.getByLabelText(/observação/i)).toHaveValue('obs antiga');

    await userEvent.clear(valor);
    await userEvent.type(valor, '30,00');
    await userEvent.selectOptions(screen.getByLabelText(/^status$/i), 'received');
    await userEvent.click(screen.getByLabelText(/preço social/i));
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT');
    expect(String(put![0])).toMatch(/\/backoffice\/pedidos\/PED001\/unidades\/u1$/);
    expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({
      received_amount: 3000,
      finalized_at: '2026-04-05',
      status: 'received',
      social_price: true,
      observation: 'obs antiga',
    });
    expect(await screen.findByText('EDITAR PEDIDO')).toBeInTheDocument();
  });

  it('Deletar item: modal irreversível; confirmar faz DELETE da unidade e volta', async () => {
    renderPage();
    await screen.findByText('#PED-001');

    await userEvent.click(screen.getByRole('button', { name: /deletar item/i }));
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === 'DELETE')).toHaveLength(0);
    expect(screen.getByRole('dialog').textContent).toMatch(/não é reversível/i);

    await userEvent.click(screen.getByRole('button', { name: /^confirmar$/i }));
    const del = fetchMock.mock.calls.find(([, i]) => i?.method === 'DELETE');
    expect(String(del![0])).toMatch(/\/backoffice\/pedidos\/PED001\/unidades\/u1$/);
    expect(await screen.findByText('EDITAR PEDIDO')).toBeInTheDocument();
  });
});
