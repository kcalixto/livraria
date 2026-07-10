import { Hono } from 'hono';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../lib/s3';
import { bookImageUrl } from '../lib/image-url';
import { apiKeyMiddleware } from '../middlewares/api-key';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const backofficeUpload = new Hono();

backofficeUpload.use('*', apiKeyMiddleware);

backofficeUpload.post('/', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body?.book_id || !body?.image_base64) {
    return c.json({ error: 'book_id and image_base64 are required' }, 400);
  }

  const image = Buffer.from(body.image_base64, 'base64');
  if (image.length < PNG_MAGIC.length || !image.subarray(0, 8).equals(PNG_MAGIC)) {
    return c.json({ error: 'image must be a PNG' }, 400);
  }
  if (image.length > MAX_IMAGE_BYTES) {
    return c.json({ error: 'image must be at most 2MB' }, 400);
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.ASSETS_S3_BUCKET_NAME,
      Key: `${process.env.STAGE}/livros/${body.book_id}.png`,
      Body: image,
      ContentType: 'image/png',
    }),
  );

  return c.json({ url: bookImageUrl(body.book_id) });
});
