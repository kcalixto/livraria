// Caracteres de controle não têm uso legítimo em texto digitado por pessoa
// (nome, contato, observação) e atrapalham log/CSV/leitor de tela. O spread
// itera por code point, então emoji e pares substitutos passam inteiros.
export function stripControlChars(text: string): string {
  return [...text].filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f).join('');
}
