import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import { API_TIMEOUT_MS } from './utils/netErrors';

// مهلة افتراضية لكل استدعاءات axios المباشرة (userApi، Employees، التقارير...)
// التي لا تمر عبر instance مخصص. بدونها يمكن لأي طلب أن يعلّق الواجهة للأبد.
axios.defaults.timeout = API_TIMEOUT_MS;

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <OfflineProvider>
      <App />
    </OfflineProvider>
  </AuthProvider>
);