import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { CartProvider } from './cart/CartContext';
import { Catalogo } from './pages/Catalogo';
import { Carrinho } from './pages/Carrinho';
import { Login } from './pages/backoffice/Login';
import { BackofficeLayout } from './pages/backoffice/BackofficeLayout';
import { Pedidos } from './pages/backoffice/Pedidos';
import { Vendas } from './pages/backoffice/Vendas';
import { Estoque } from './pages/backoffice/Estoque';
import { Livros } from './pages/backoffice/Livros';
import { LivroForm } from './pages/backoffice/LivroForm';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/carrinho" element={<Carrinho />} />
          <Route path="/backoffice" element={<Login />} />
          <Route element={<BackofficeLayout />}>
            <Route path="/backoffice/pedidos" element={<Pedidos />} />
            <Route path="/backoffice/vendas" element={<Vendas />} />
            <Route path="/backoffice/estoque" element={<Estoque />} />
            <Route path="/backoffice/livros" element={<Livros />} />
            <Route path="/backoffice/livros/novo" element={<LivroForm />} />
            <Route path="/backoffice/livros/:id/editar" element={<LivroForm />} />
          </Route>
        </Routes>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
