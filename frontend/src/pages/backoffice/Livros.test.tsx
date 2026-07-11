import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Livros } from './Livros';

const livros = [
  {
    id: '47aeb72f-5448-4859-b6b0-13b7079e095f',
    title: 'A Comuna e o Fogo',
    author: 'Aurélio Bandeira',
    price: 4200,
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/livros']}>
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
  it('lista os livros com título, autor e preço formatado', async () => {
    renderPage();

    expect(await screen.findByText('A Comuna e o Fogo')).toBeInTheDocument();
    expect(screen.getByText('O Pão e as Rosas')).toBeInTheDocument();
    expect(screen.getByText('Aurélio Bandeira')).toBeInTheDocument();
    expect(screen.getByText('R$ 42,00')).toBeInTheDocument();
  });

  it('tem link para criar novo livro', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: /novo livro/i })).toBeInTheDocument();
  });

  it('excluir pede confirmação e chama DELETE com Bearer', async () => {
    renderPage();

    const excluirButtons = await screen.findAllByRole('button', { name: /^excluir$/i });
    await userEvent.click(excluirButtons[0]);
    await userEvent.click(screen.getByRole('button', { name: /confirmar exclusão/i }));

    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(deleteCall).toBeTruthy();
    const [url, init] = deleteCall as [string, RequestInit];
    expect(url).toMatch(/\/backoffice\/livros\/47aeb72f-5448-4859-b6b0-13b7079e095f$/);
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer jwt-abc');
    expect(headers['x-api-key']).toBe('test-key');
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
