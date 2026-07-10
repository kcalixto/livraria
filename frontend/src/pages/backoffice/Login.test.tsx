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
});
