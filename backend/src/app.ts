import { Hono } from 'hono';
import { livros } from './routes/livros';
import { backofficeLivros } from './routes/backoffice-livros';
import { backofficeUpload } from './routes/backoffice-upload';

export const app = new Hono();

app.route('/', livros);
app.route('/backoffice/livros', backofficeLivros);
app.route('/backoffice/upload-image', backofficeUpload);
