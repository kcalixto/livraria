import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BackofficeLayout } from './BackofficeLayout';

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/backoffice/pedidos']}>
      <Routes>
        <Route path="/backoffice" element={<div>LOGIN PAGE</div>} />
        <Route element={<BackofficeLayout />}>
          <Route path="/backoffice/pedidos" element={<div>CONTEUDO</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// JWT fake com exp controlado (payload em base64)
function fakeJwt(expInSeconds: number): string {
  const payload = btoa(JSON.stringify({ role: 'admin', exp: expInSeconds }));
  return `header.${payload}.sig`;
}

beforeEach(() => {
  sessionStorage.setItem('livraria:token', fakeJwt(Math.floor(Date.now() / 1000) + 3600));
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe('BackofficeLayout', () => {
  it('tem botão Sair que limpa o token e volta pro login', async () => {
    renderLayout();

    await userEvent.click(screen.getByRole('button', { name: /sair/i }));

    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
    expect(sessionStorage.getItem('livraria:token')).toBeNull();
  });

  it('avisa quando a sessão está perto de expirar (<10min)', () => {
    sessionStorage.setItem(
      'livraria:token',
      fakeJwt(Math.floor(Date.now() / 1000) + 5 * 60), // expira em 5min
    );
    renderLayout();

    expect(screen.getByText(/sessão expira em 5min/i)).toBeInTheDocument();
  });

  it('não mostra aviso com sessão longe de expirar', () => {
    renderLayout();
    expect(screen.queryByText(/sessão expira/i)).not.toBeInTheDocument();
  });
});
