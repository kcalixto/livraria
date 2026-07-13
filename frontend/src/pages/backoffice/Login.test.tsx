import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Login } from './Login';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/backoffice']}>
      <Routes>
        <Route path="/backoffice" element={<Login />} />
        <Route path="/backoffice/pedidos" element={<div>PEDIDOS PAGE</div>} />
        <Route path="/backoffice/estoque" element={<div>ESTOQUE PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Login do backoffice', () => {
  it('senha correta: salva token e navega para pedidos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'jwt-abc' }), { status: 200 })),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText(/senha/i), 'segredo');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('PEDIDOS PAGE')).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBe('jwt-abc');
  });

  it('senha de perfil stock leva direto pro Estoque', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ token: 'jwt-stock', role: 'stock' }), { status: 200 }),
        ),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText(/senha/i), 'senha-estoque');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('ESTOQUE PAGE')).toBeInTheDocument();
  });

  it('mostra aviso de sessão expirada e retorna à rota de origem após o login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: 'jwt-novo' }), { status: 200 })),
    );
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/backoffice', state: { expired: true, from: '/backoffice/vendas' } },
        ]}
      >
        <Routes>
          <Route path="/backoffice" element={<Login />} />
          <Route path="/backoffice/pedidos" element={<div>PEDIDOS PAGE</div>} />
          <Route path="/backoffice/vendas" element={<div>VENDAS PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText(/sessão expirada/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/senha/i), 'segredo');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText('VENDAS PAGE')).toBeInTheDocument();
  });

  it('senha errada: mostra erro e não salva token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    );
    renderLogin();

    await userEvent.type(screen.getByLabelText(/senha/i), 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));

    expect(await screen.findByText(/senha incorreta/i)).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBeNull();
  });

  it('básicos de acessibilidade: foco inicial, autocomplete e erro como alert', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    );
    renderLogin();

    const input = screen.getByLabelText(/senha/i);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('autocomplete', 'current-password');

    await userEvent.type(input, 'errada');
    await userEvent.click(screen.getByRole('button', { name: /entrar/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/senha incorreta/i);
  });
});
