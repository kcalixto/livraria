import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CartProvider } from '../cart/CartContext';
import { LivroEntry } from './LivroEntry';
import type { Book } from '../lib/types';

const baseBook: Book = {
  id: 'b1',
  title: 'A Comuna e o Fogo',
  author: 'Aurélio Bandeira',
  description: 'Par 1.\n\nPar 2.\n\nPar 3.',
  price: 4200,
  pages: 288,
  edition: '2ª edição',
  year: 2023,
  format: 'Ensaio',
  amount: 12,
  status: 'disponível',
  image_url: 'https://exemplo/dev/livros/b1.png',
};

function renderEntry(book: Book) {
  return render(
    <CartProvider>
      <LivroEntry book={book} />
    </CartProvider>,
  );
}

describe('LivroEntry', () => {
  it('renderiza título, autor entre parênteses, parágrafos, metadados e preço', () => {
    renderEntry(baseBook);
    expect(screen.getByRole('heading', { name: 'A Comuna e o Fogo' })).toBeInTheDocument();
    expect(screen.getByText('(Aurélio Bandeira)')).toBeInTheDocument();
    expect(screen.getByText('Par 1.')).toBeInTheDocument();
    expect(screen.getByText('Par 3.')).toBeInTheDocument();
    expect(screen.getByText('Ensaio · 2ª edição · 2023 · 288 págs')).toBeInTheDocument();
    expect(screen.getByText('R$ 42,00')).toBeInTheDocument();
  });

  it('com estoque alto mostra badge verde e botão de adicionar', () => {
    renderEntry(baseBook);
    expect(screen.getByText('12 na Zona Sul')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /adicionar ao carrinho/i })).toBeInTheDocument();
    expect(screen.queryByText('Esgotado')).not.toBeInTheDocument();
  });

  it('com estoque baixo (1-3) mostra badge "Últimas"', () => {
    renderEntry({ ...baseBook, amount: 2 });
    expect(screen.getByText('Últimas 2 na Zona Sul')).toBeInTheDocument();
  });

  it('esgotado: selo, texto e sem botão de carrinho', () => {
    renderEntry({ ...baseBook, amount: 0 });
    expect(screen.getByText('Esgotado')).toBeInTheDocument();
    expect(screen.getByText('Sem estoque na região')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /adicionar ao carrinho/i }),
    ).not.toBeInTheDocument();
  });

  it('renderiza o status do livro como tag quando disponível', () => {
    renderEntry(baseBook);
    expect(screen.getByText('disponível')).toBeInTheDocument();
  });
});
