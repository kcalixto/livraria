// URL derivada por convenção — nada de URL de imagem no banco.
export function bookImageUrl(bookId: string): string {
  const bucket = process.env.ASSETS_S3_BUCKET_NAME;
  const stage = process.env.STAGE;
  return `https://${bucket}.s3.sa-east-1.amazonaws.com/${stage}/livros/${bookId}.png`;
}
