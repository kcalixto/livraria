// Escapa um valor para CSV com separador ';' E neutraliza injeção de fórmula
// no Excel: célula começando com = + - @ executaria como fórmula ao abrir o
// arquivo — prefixa apóstrofo (o Excel exibe o texto literal).
export function csvEscape(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[;"\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
