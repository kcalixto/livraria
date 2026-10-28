declare namespace NodeJS {
  interface ProcessEnv {
    STAGE: string;
    ASSETS_S3_BUCKET_NAME: string;
    LIVROS_TABLE_NAME: string;
    PEDIDOS_TABLE_NAME: string;
    LOTES_TABLE_NAME: string;
    LIVRARIA_FRONT_END_API_KEY: string;
    BACKOFFICE_KEY: string;
    BACKOFFICE_VIEWER_KEY: string;
    BACKOFFICE_STOCK_KEY: string;
    JWT_SECRET: string;
    SITE_CDN_DOMAIN: string;
  }
}
