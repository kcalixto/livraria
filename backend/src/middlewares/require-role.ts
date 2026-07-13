import { createMiddleware } from 'hono/factory';

export type Role = 'admin' | 'viewer' | 'stock';

declare module 'hono' {
  interface ContextVariableMap {
    jwtRole?: Role;
  }
}

// A fronteira real da segmentação é aqui: o front esconde botões/abas, mas é
// o token que decide. Fora do escopo do role = 401 (pedido do dono).
export function requireRole(...roles: Role[]) {
  return createMiddleware(async (c, next) => {
    const role = c.get('jwtRole');
    if (!role || !roles.includes(role)) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    await next();
  });
}
