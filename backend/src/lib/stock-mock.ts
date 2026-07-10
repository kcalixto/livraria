export const BOOK_STATUS_AVAILABLE = 'disponível';

// Estoque mockado: inteiro aleatório 0-10 a cada chamada.
// Substituir por dado real por região quando o estoque sair do mock.
export function mockAmount(): number {
  return Math.floor(Math.random() * 11);
}
