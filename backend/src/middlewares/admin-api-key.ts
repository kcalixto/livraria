import { createMiddleware } from 'hono/factory';

// Segmentação de acesso: ações destrutivas exigem a chave ADMIN (não embarcada
// no front — uso via curl/scripts por quem detém a chave).
export const adminApiKeyMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header('x-admin-api-key');
  if (!key || key !== process.env.BACKOFFICE_ADMIN_API_KEY) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});
