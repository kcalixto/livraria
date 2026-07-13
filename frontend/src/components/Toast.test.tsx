import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { Toast } from './Toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('sucesso: role status (aria-live polite) e some em 4s', () => {
    const onDone = vi.fn();
    render(<Toast toast={{ kind: 'success', message: 'Livro salvo' }} onDone={onDone} />);

    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Livro salvo');

    act(() => vi.advanceTimersByTime(3999));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDone).toHaveBeenCalled();
  });

  it('erro: role alert e fica 8s na tela', () => {
    const onDone = vi.fn();
    render(<Toast toast={{ kind: 'error', message: 'Falhou' }} onDone={onDone} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Falhou');

    act(() => vi.advanceTimersByTime(4000));
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(4000));
    expect(onDone).toHaveBeenCalled();
  });
});
