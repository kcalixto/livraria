import { beforeEach, describe, expect, it } from 'vitest';
import { bookImageUrl } from './image-url';

describe('bookImageUrl', () => {
  beforeEach(() => {
    process.env.ASSETS_S3_BUCKET_NAME = 'livraria-assets-bucket';
    process.env.STAGE = 'dev';
  });

  it('deriva a URL do bucket de assets com prefixo de stage', () => {
    expect(bookImageUrl('abc-123')).toBe(
      'https://livraria-assets-bucket.s3.sa-east-1.amazonaws.com/dev/livros/abc-123.png',
    );
  });

  it('usa o stage do ambiente', () => {
    process.env.STAGE = 'prd';
    expect(bookImageUrl('x')).toBe(
      'https://livraria-assets-bucket.s3.sa-east-1.amazonaws.com/prd/livros/x.png',
    );
  });
});
