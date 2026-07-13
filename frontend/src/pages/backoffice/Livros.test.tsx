import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Livros } from './Livros';

const livros = [
  {
    id: '47aeb72f-5448-4859-b6b0-13b7079e095f',
    title: 'A Comuna e o Fogo',
    author: 'Aurélio Bandeira',
    price: 4200,
    social_price: 3000,
    year: 2023,
    description: 'x',
    amount: 3,
    status: 'disponível',
  },
  {
    id: 'd32358b6-f991-47fd-8615-0f4d77cc330b',
    title: 'O Pão e as Rosas',
    author: 'Beatriz Andrade',
    price: 3800,
    social_price: 2500,
    year: 2024,
    description: 'y',
    amount: 1,
    status: 'disponível',
  },
];

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response(JSON.stringify(livros), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderPage(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/backoffice/livros', state }]}>
      <Routes>
        <Route path="/backoffice" element={<div>LOGIN PAGE</div>} />
        <Route path="/backoffice/livros" element={<Livros />} />
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

describe('Backoffice — Livros', () => {
  it('lista os livros com título, autor, preço e preço social formatados', async () => {
    renderPage();

    expect(await screen.findByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.getByText('Aurélio Bandeira')).toBeInTheDocument();
    expect(screen.getByText('R$ 42,00')).toBeInTheDocument();
    expect(screen.getByText('P. social')).toBeInTheDocument();
    expect(screen.getByText('R$ 30,00')).toBeInTheDocument();
  });

  it('tem link para criar novo livro', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /novo livro/i })).toBeInTheDocument();
  });

  it('ordena por título e busca filtra a lista', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    // ordenados alfabeticamente (fixture vem A Comuna / O Pão — já em ordem;
    // valida via DOM que A Comuna vem antes)
    const titles = Array.from(document.querySelectorAll('.bo-livros__title')).map(
      (t) => t.textContent,
    );
    expect(titles).toEqual([...titles].sort((a, b) => a!.localeCompare(b!)));

    await userEvent.type(screen.getByPlaceholderText(/buscar por título/i), 'pão');
    await waitFor(() =>
      expect(screen.queryByText('A Comuna e o Fogo')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
  });

  it('não tem botão de excluir (exclusão é segmentada por chave admin, via curl)', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument();
  });

  it('mostra o início do uuid e copia o id completo ao clicar', async () => {
    const user = userEvent.setup();
    renderPage();

    const idChip = await screen.findByRole('button', { name: '47ae…' });
    await user.click(idChip);

    expect(await navigator.clipboard.readText()).toBe(
      '47aeb72f-5448-4859-b6b0-13b7079e095f',
    );
    expect(await screen.findByText(/copiado/i)).toBeInTheDocument();
  });

  it('a capa da listagem vem de /images/<stage>/<id>.jpg', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');
    const covers = document.querySelectorAll('.bo-livros__cover img');
    expect((covers[0] as HTMLImageElement).getAttribute('src')).toBe(
      '/images/dev/47aeb72f-5448-4859-b6b0-13b7079e095f.jpg',
    );
  });

  it('livro sem capa mostra o fallback listrado na listagem', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    const img = document.querySelector('.bo-livros__cover img') as HTMLImageElement;
    fireEvent.error(img);

    expect(document.querySelector('.bo-livros__cover-fallback')).toBeInTheDocument();
  });

  it('livro sem capa ganha badge "sem capa" na linha', async () => {
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    const img = document.querySelector('.bo-livros__cover img') as HTMLImageElement;
    fireEvent.error(img);

    expect(await screen.findByText(/sem capa/i)).toBeInTheDocument();
  });

  it('mostra toast de sucesso vindo do form (navigation state)', async () => {
    renderPage({ toast: 'Livro salvo' });
    await screen.findByText('A Comuna e o Fogo');
    expect(screen.getByText(/livro salvo/i)).toBeInTheDocument();
  });

  it('perfil de leitura não vê Novo livro nem Editar', async () => {
    sessionStorage.setItem(
      'livraria:token',
      'header.' + btoa(JSON.stringify({ role: 'stock', exp: Math.floor(Date.now() / 1000) + 3600 })) + '.sig',
    );
    renderPage();
    await screen.findByText('A Comuna e o Fogo');

    expect(screen.queryByRole('link', { name: /novo livro/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('401: limpa token e volta pro login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 }))),
    );
    renderPage();

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBeNull();
  });
});
