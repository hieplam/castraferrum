// Web composition root: the ONLY place that creates the implementations (HttpLoopsApi, SseLiveEvents) and wraps the providers -
// language + light/dark (web/prefs), data + live (web/data), toast (web/ui), router. Nobody imports this file.
// The UI switch (task U13): `uiVersion()` picks the classic or the new UI once; `<html data-ui>` marks it, and only that UI's
// CSS and fonts are loaded (dynamic import, before the first render), so the two stylesheets never mix.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { HttpLoopsApi } from './api/http-loops-api';
import { SseLiveEvents } from './api/sse-live-events';
import { App } from './app/App';
import { DataProvider } from './data/provider';
import { applyStoredPrefs, PrefsProvider } from './prefs/prefs';
import { uiVersion } from './prefs/ui-version';
import { ToastProvider } from './ui/toast';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root in index.html');

const ui = uiVersion();
document.documentElement.dataset.ui = ui;
// iOS (spec 4.9): the new UI draws under the notch and the home indicator and pads its bars with the safe-area insets; the classic
// UI has no such padding, so only the new UI asks for the whole screen.
if (ui === 'new') {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content = `${viewport.content}, viewport-fit=cover`;
}
if (ui === 'new') await Promise.all([import('./ui/kit/fonts'), import('./ui/kit/styles.css')]);
else await Promise.all([import('./ui/fonts'), import('./ui/styles.css')]);

applyStoredPrefs();
createRoot(root).render(
  <StrictMode>
    <PrefsProvider>
      <DataProvider api={new HttpLoopsApi()} live={new SseLiveEvents()}>
        <ToastProvider>
          <BrowserRouter>
            <App ui={ui} />
          </BrowserRouter>
        </ToastProvider>
      </DataProvider>
    </PrefsProvider>
  </StrictMode>,
);
