import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { sign } from 'hono/jwt';
import { app } from '../app';

const s3Mock = mockClient(S3Client);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngBase64(totalBytes: number): string {
  const buf = Buffer.alloc(totalBytes);
  PNG_MAGIC.copy(buf);
  return buf.toString('base64');
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await sign(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 3600 },
    'segredo-jwt-teste',
  );
  return {
    'x-api-key': 'chave-front',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  s3Mock.reset();
  process.env.LIVRARIA_FRONT_END_API_KEY = 'chave-front';
  process.env.JWT_SECRET = 'segredo-jwt-teste';
  process.env.ASSETS_S3_BUCKET_NAME = 'livraria-assets-bucket';
  process.env.STAGE = 'dev';
});

describe('POST /backoffice/upload-image', () => {
  it('retorna 401 sem JWT (mesmo com api key)', async () => {
    const res = await app.request('/backoffice/upload-image', {
      method: 'POST',
      body: JSON.stringify({ book_id: 'b1', image_base64: pngBase64(100) }),
      headers: { 'x-api-key': 'chave-front', 'content-type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('retorna 400 sem book_id ou sem image_base64', async () => {
    for (const body of [{ image_base64: pngBase64(100) }, { book_id: 'b1' }]) {
      const res = await app.request('/backoffice/upload-image', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: await authHeaders(),
      });
      expect(res.status).toBe(400);
    }
  });

  it('rejeita imagem que não é PNG (magic bytes)', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]).toString('base64');
    const res = await app.request('/backoffice/upload-image', {
      method: 'POST',
      body: JSON.stringify({ book_id: 'b1', image_base64: jpeg }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/png/i);
  });

  it('rejeita imagem maior que 2MB decodificada', async () => {
    const res = await app.request('/backoffice/upload-image', {
      method: 'POST',
      body: JSON.stringify({ book_id: 'b1', image_base64: pngBase64(2 * 1024 * 1024 + 1) }),
      headers: await authHeaders(),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/2\s?MB/i);
  });

  it('grava PNG válido em ${stage}/livros/${book_id}.png e retorna a url', async () => {
    s3Mock.on(PutObjectCommand).resolves({});

    const res = await app.request('/backoffice/upload-image', {
      method: 'POST',
      body: JSON.stringify({ book_id: 'b1', image_base64: pngBase64(1024) }),
      headers: await authHeaders(),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: 'https://livraria-assets-bucket.s3.sa-east-1.amazonaws.com/dev/livros/b1.png',
    });

    const input = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(input.Bucket).toBe('livraria-assets-bucket');
    expect(input.Key).toBe('dev/livros/b1.png');
    expect(input.ContentType).toBe('image/png');
    expect(Buffer.isBuffer(input.Body)).toBe(true);
    expect((input.Body as Buffer).length).toBe(1024);
  });
});
