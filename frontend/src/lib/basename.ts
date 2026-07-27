// Caminho do coletivo no domínio próprio: https://edicoes.zonasul.click/manoel-lisboa
export const SITE_PATH = '/manoel-lisboa';

// O endereço oficial serve o app sob SITE_PATH (o CloudFront tira o prefixo
// antes do bucket), mas a origem S3 legada — e o vite dev local — servem na
// raiz. Derivar o basename do próprio caminho deixa os dois funcionarem, sem
// tela branca em quem tem a URL antiga guardada.
export function siteBasename(pathname: string): string {
  return pathname === SITE_PATH || pathname.startsWith(`${SITE_PATH}/`) ? SITE_PATH : '/';
}
