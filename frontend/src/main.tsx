import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'
import { RpcConnection, PubkeyUtil, MessageUtil } from "@arch-network/arch-sdk";

// Properly set up Buffer for browser environment
import { Buffer } from 'buffer/';

// Make SDK available globally
window.archSdk = {
  RpcConnection,
  PubkeyUtil,
  MessageUtil
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
