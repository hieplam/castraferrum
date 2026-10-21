// Web composition root: the ONLY place that creates the implementations (HttpLoopsApi, SseLiveEvents) and wraps the providers -
// language + light/dark (web/prefs), data + live (web/data), toast (web/ui), router. Nobody imports this file.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { HttpLoopsApi } from './api/http-loops-api';
import { SseLiveEvents } from './api/sse-live-events';
import { App } from './app/App';
import { DataProvider } from './data/provider';
import { applyStoredPrefs, PrefsProvider } from './prefs/prefs';
import { ToastProvider } from './ui/toast';
import './ui/fonts';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root in index.html');

applyStoredPrefs();
createRoot(root).render(
  <StrictMode>
    <PrefsProvider>
      <DataProvider api={new HttpLoopsApi()} live={new SseLiveEvents()}>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </DataProvider>
    </PrefsProvider>
  </StrictMode>,
);
