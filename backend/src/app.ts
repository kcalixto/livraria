import { Hono } from "hono";
import { cors } from "hono/cors";
import { livros } from "./routes/livros";
import { backofficeLivros } from "./routes/backoffice-livros";
import { backofficeUpload } from "./routes/backoffice-upload";
import { pedidos } from "./routes/pedidos";
import { backofficeAuth } from "./routes/backoffice-auth";
import { backofficePedidos } from "./routes/backoffice-pedidos";

export const app = new Hono();

// TODO: fix me
app.use("*", cors({ origin: "*" }));

app.route("/", livros);
app.route("/pedidos", pedidos);
app.route("/backoffice/login", backofficeAuth);
app.route("/backoffice/livros", backofficeLivros);
app.route("/backoffice/upload-image", backofficeUpload);
app.route("/backoffice/pedidos", backofficePedidos);
