// Web composition root: the ONLY place that creates the implementations (HttpLoopsApi, SseLiveEvents) and wraps the providers -
// language + light/dark (web/prefs), data + live (web/data), toast (web/ui), router. Nobody imports this file.
// The CSS of the design system (design/ds/, through web/ui/kit/styles.css) and its self-hosted fonts are imported here, once.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { HttpLoopsApi } from './api/http-loops-api';
import { SseLiveEvents } from './api/sse-live-events';
import { App } from './app/App';
import { DataProvider } from './data/provider';
import { applyStoredPrefs, PrefsProvider } from './prefs/prefs';
import { ToastProvider } from './ui/toast';
import './ui/kit/fonts';
import './ui/kit/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root in index.html');


applyStoredPrefs();
// `useTransitions={false}`: a route change is a plain update, not a transition. React renders a transition in slices, one scheduler
// task per slice, and keeps the old page until the last slice. In WebKit on a loaded machine those tasks waited so long that the next
// page came only when the transition expired, 5 s after the click (issues 413 and 414). No page suspends and nothing reads a pending
// route change, so the old page staying on screen gave nothing (tests/e2e/route-change.spec.ts).
createRoot(root).render(
  <StrictMode>
    <PrefsProvider>
      <DataProvider api={new HttpLoopsApi()} live={new SseLiveEvents()}>
        <ToastProvider>
          <BrowserRouter useTransitions={false}>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </DataProvider>
    </PrefsProvider>
  </StrictMode>,
);
