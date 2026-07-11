import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyMiddleware } from "./middlewares/api-key";
import { livros } from "./routes/livros";
import { backofficeLivros } from "./routes/backoffice-livros";
import { backofficeLotes } from "./routes/backoffice-lotes";
import { backofficeEstoque } from "./routes/backoffice-estoque";
import { pedidos } from "./routes/pedidos";
import { backofficeAuth } from "./routes/backoffice-auth";
import { backofficePedidos } from "./routes/backoffice-pedidos";

export const app = new Hono();

// TODO: fix me
app.use("*", cors({ origin: "*" }));

// Gate global: toda rota exige a chave de api do front (o cors responde o
// preflight OPTIONS antes de chegar aqui). Auth real do backoffice é o JWT.
app.use("*", apiKeyMiddleware);

app.route("/", livros);
app.route("/pedidos", pedidos);
app.route("/backoffice/login", backofficeAuth);
app.route("/backoffice/livros", backofficeLivros);
app.route("/backoffice/lotes", backofficeLotes);
app.route("/backoffice/estoque", backofficeEstoque);
app.route("/backoffice/pedidos", backofficePedidos);
