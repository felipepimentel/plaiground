import { SnackbarProvider } from 'notistack';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css'; // We can add basic styling later

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <SnackbarProvider maxSnack={3}>
            <App />
        </SnackbarProvider>
    </React.StrictMode>,
) 