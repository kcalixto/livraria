import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './styles.css';
import { CartProvider } from './cart/CartContext';
import { Catalogo } from './pages/Catalogo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <Routes>
          <Route path="/" element={<Catalogo />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
