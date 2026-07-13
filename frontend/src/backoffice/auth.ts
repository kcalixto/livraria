const TOKEN_KEY = 'livraria:token';

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

function tokenPayload(): Record<string, unknown> | null {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1] ?? ''));
  } catch {
    return null;
  }
}

// epoch (segundos) de expiração do JWT, lido do payload; null se ilegível
export function tokenExpiresAt(): number | null {
  const exp = tokenPayload()?.exp;
  return typeof exp === 'number' ? exp : null;
}

export type Role = 'admin' | 'viewer' | 'stock';

export function tokenRole(): Role | null {
  const role = tokenPayload()?.role;
  return role === 'admin' || role === 'viewer' || role === 'stock' ? role : null;
}

// front é cosmético (a fronteira real é o backend): token ilegível age como
// escrita pra não esconder nada de tokens legados — a API nega se for o caso
export function canWrite(): boolean {
  const role = tokenRole();
  return role !== 'viewer' && role !== 'stock';
}

// primeira rota permitida do perfil (destino pós-login e fallback dos guards)
export function homeRoute(): string {
  return tokenRole() === 'stock' ? '/backoffice/estoque' : '/backoffice/pedidos';
}
