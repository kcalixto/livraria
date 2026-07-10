import { Hono } from 'hono';
import { livros } from './routes/livros';
import { backofficeLivros } from './routes/backoffice-livros';

export const app = new Hono();

app.route('/', livros);
app.route('/backoffice/livros', backofficeLivros);
