import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LocalDataSource } from './data/LocalDataSource';
import './index.css';
import { StoreProvider } from './state/store';

const source = new LocalDataSource();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider source={source}>
      <App />
    </StoreProvider>
  </StrictMode>,
);
