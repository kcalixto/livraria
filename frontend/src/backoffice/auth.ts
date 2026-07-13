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

// epoch (segundos) de expiração do JWT, lido do payload; null se ilegível
export function tokenExpiresAt(): number | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}
