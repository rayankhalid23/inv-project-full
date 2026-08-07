import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <OfflineProvider>
      <App />
    </OfflineProvider>
  </AuthProvider>
);