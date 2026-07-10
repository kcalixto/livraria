import { Hono } from 'hono';
import { livros } from './routes/livros';

export const app = new Hono();

app.route('/', livros);
