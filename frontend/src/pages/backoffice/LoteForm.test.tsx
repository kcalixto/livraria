import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoteForm } from './LoteForm';

const livros = [
  { id: 'b1', title: 'A Comuna e o Fogo', price: 4200, amount: 0, status: 'disponível' },
  { id: 'b2', title: 'O Pão e as Rosas', price: 3800, amount: 0, status: 'disponível' },
  { id: 'b3', title: 'Manual do Agitador Cultural', price: 3400, amount: 0, status: 'disponível' },
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sessionStorage.setItem('livraria:token', 'jwt-abc');
  fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ id: 'novo-lote' }), { status: 201 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/lotes/novo']}>
      <Routes>
        <Route path="/backoffice/lotes" element={<div>LISTA LOTES</div>} />
        <Route path="/backoffice/lotes/novo" element={<LoteForm />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Backoffice — Novo lote', () => {
  it('busca por título filtra os livros disponíveis', async () => {
    renderPage();

    await screen.findByText('A Comuna e o Fogo');
    await userEvent.type(screen.getByPlaceholderText(/buscar por título/i), 'pão');

    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument();
  });

  it('adiciona livros, informa custo e envia o lote com centavos e região', async () => {
    renderPage();

    await screen.findByText('A Comuna e o Fogo');
    // adiciona 2 unidades do primeiro livro
    await userEvent.click(screen.getAllByRole('button', { name: /adicionar/i })[0]);
    const qty = screen.getByLabelText(/quantidade de a comuna e o fogo/i);
    await userEvent.clear(qty);
    await userEvent.type(qty, '2');

    await userEvent.type(screen.getByLabelText(/valor total/i), '80,00');
    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));

    expect(await screen.findByText('LISTA LOTES')).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'POST');
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      region: 'SP, Capital - Zona Sul',
      books: [{ book_id: 'b1', amount: 2 }],
      total_cost: 8000,
    });
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('valida: sem livros ou custo inválido não envia', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    await userEvent.click(screen.getByRole('button', { name: /salvar lote/i }));

    expect(screen.getByText(/adicione pelo menos um livro/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um valor válido/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'POST'),
    ).toHaveLength(0);
  });
});
