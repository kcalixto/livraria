import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import { AppRoutes } from './App';
import { CartProvider } from './cart/CartContext';
import { siteBasename } from './lib/basename';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* o site vive em <domínio>/manoel-lisboa (caminho do coletivo); o
        CloudFront tira o prefixo antes do bucket, o Router o devolve nos links */}
    <BrowserRouter basename={siteBasename(window.location.pathname)}>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
