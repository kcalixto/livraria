import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StockBadge } from './StockBadge';

describe('StockBadge', () => {
  it('no singular fala de um exemplar só', () => {
    render(<StockBadge amount={1} />);
    expect(screen.getByText('Último disponível na região')).toBeInTheDocument();
  });

  it('avisa que o estoque está baixo no plural', () => {
    render(<StockBadge amount={3} />);
    expect(screen.getByText('Últimas 3 na região')).toBeInTheDocument();
  });

  it('estoque folgado mostra só a quantidade', () => {
    render(<StockBadge amount={12} />);
    expect(screen.getByText('12 na região')).toBeInTheDocument();
  });

  it('não renderiza nada quando não há o que vender', () => {
    const { container } = render(<StockBadge amount={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
