import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LivroForm } from './LivroForm';

const existingBook = {
  id: 'b1',
  title: 'A Comuna e o Fogo',
  author: 'Aurélio Bandeira',
  price: 4200,
  pages: 288,
  edition: '2ª edição',
  year: 2023,
  format: 'Ensaio',
  description: 'Par 1.\n\nPar 2.',
  amount: 3,
  status: 'disponível',
  image_url: 'http://img/b1.png',
};

let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST' && u.includes('/backoffice/livros')) {
      return Promise.resolve(
        new Response(JSON.stringify({ ...existingBook, id: 'novo-id' }), { status: 201 }),
      );
    }
    if (init?.method === 'POST' && u.includes('/upload-image')) {
      return Promise.resolve(new Response(JSON.stringify({ url: 'http://img' }), { status: 200 }));
    }
    if (init?.method === 'PUT') {
      return Promise.resolve(new Response(JSON.stringify(existingBook), { status: 200 }));
    }
    return Promise.resolve(new Response(JSON.stringify([existingBook]), { status: 200 }));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderForm(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/backoffice/livros" element={<div>LISTA LIVROS</div>} />
        <Route path="/backoffice/livros/novo" element={<LivroForm />} />
        <Route path="/backoffice/livros/:id/editar" element={<LivroForm />} />
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

describe('LivroForm — criar', () => {
  it('valida campos obrigatórios sem chamar a API', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(screen.getByText(/informe o título/i)).toBeInTheDocument();
    expect(screen.getByText(/informe a descrição/i)).toBeInTheDocument();
    expect(screen.getByText(/informe um preço válido/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, i]) => (i as RequestInit)?.method === 'POST')).toHaveLength(0);
  });

  it('cria livro convertendo preço de reais para centavos e volta pra lista', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.type(screen.getByLabelText(/título/i), 'Livro Novo');
    await userEvent.type(screen.getByLabelText(/autor/i), 'Autora Nova');
    await userEvent.type(screen.getByLabelText(/descrição/i), 'Par A.\n\nPar B.');
    await userEvent.type(screen.getByLabelText(/preço/i), '49,90');
    await userEvent.type(screen.getByLabelText(/páginas/i), '200');
    await userEvent.type(screen.getByLabelText(/ano/i), '2026');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(
      ([u, i]) => (i as RequestInit)?.method === 'POST' && String(u).endsWith('/backoffice/livros'),
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse((postCall![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      title: 'Livro Novo',
      author: 'Autora Nova',
      price: 4990,
      pages: 200,
      year: 2026,
    });
    const headers = (postCall![1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer jwt-abc');
  });

  it('rejeita capa acima de 2MB sem chamar upload', async () => {
    renderForm('/backoffice/livros/novo');

    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'capa.png', {
      type: 'image/png',
    });
    await userEvent.upload(screen.getByLabelText(/capa/i), big);

    expect(await screen.findByText(/no máximo 2MB/i)).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/upload-image')),
    ).toHaveLength(0);
  });

  it('rejeita arquivo que não é PNG', async () => {
    renderForm('/backoffice/livros/novo');

    const jpeg = new File(['x'], 'capa.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText(/capa/i), jpeg, { applyAccept: false });

    expect(await screen.findByText(/apenas png/i)).toBeInTheDocument();
  });

  it('com capa selecionada, cria o livro e sobe a imagem com o id retornado', async () => {
    renderForm('/backoffice/livros/novo');

    await userEvent.type(screen.getByLabelText(/título/i), 'Com Capa');
    await userEvent.type(screen.getByLabelText(/descrição/i), 'Desc.');
    await userEvent.type(screen.getByLabelText(/preço/i), '10,00');
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'capa.png', {
      type: 'image/png',
    });
    await userEvent.upload(screen.getByLabelText(/capa/i), png);
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/upload-image'));
      expect(uploadCall).toBeTruthy();
      const body = JSON.parse((uploadCall![1] as RequestInit).body as string);
      expect(body.book_id).toBe('novo-id');
      expect(typeof body.image_base64).toBe('string');
      expect(body.image_base64.length).toBeGreaterThan(0);
    });
  });
});

describe('LivroForm — editar', () => {
  it('carrega os dados do livro e envia PUT com os campos alterados', async () => {
    renderForm('/backoffice/livros/b1/editar');

    const titulo = await screen.findByLabelText(/título/i);
    expect(titulo).toHaveValue('A Comuna e o Fogo');
    expect(screen.getByLabelText(/preço/i)).toHaveValue('42,00');

    await userEvent.clear(titulo);
    await userEvent.type(titulo, 'Título Editado');
    await userEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('LISTA LIVROS')).toBeInTheDocument();

    const putCall = fetchMock.mock.calls.find(([, i]) => (i as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    expect(String(putCall![0])).toMatch(/\/backoffice\/livros\/b1$/);
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    expect(body.title).toBe('Título Editado');
    expect(body.price).toBe(4200);
  });
});
