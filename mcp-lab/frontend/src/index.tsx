import { SnackbarProvider } from 'notistack';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './mcp-styles.css'; // MCP Lab consolidated styles

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <SnackbarProvider maxSnack={3}>
            <App />
        </SnackbarProvider>
    </React.StrictMode>,
) 