import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { CartProvider } from './cart/CartContext';
import { Catalogo } from './pages/Catalogo';
import { Carrinho } from './pages/Carrinho';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/" element={<Catalogo />} />
          <Route path="/carrinho" element={<Carrinho />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
