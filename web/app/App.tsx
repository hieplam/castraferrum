// Router of the 5 screens (SPEC section "Screens") inside the app frame. Each screen is a file in web/pages/ owned by the story of that screen -
// phase 1: HomePage + features/loop-list · phase 1: LoopFormPage · phase 1: LoopDetailPage, ExecutionPage, RunPage ·
// phase 2: ReposPage (the Repo page, phase 2).
// Only add / change paths here.
import { Route, Routes } from 'react-router';
import { ExecutionPage } from '../pages/ExecutionPage';
import { HomePage } from '../pages/HomePage';
import { LoopDetailPage } from '../pages/LoopDetailPage';
import { LoopFormPage } from '../pages/LoopFormPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ReposPage } from '../pages/ReposPage';
import { RunPage } from '../pages/RunPage';
import { AppShell } from './AppShell';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="loops/new" element={<LoopFormPage />} />
        <Route path="loops/:id/edit" element={<LoopFormPage />} />
        <Route path="loops/:id" element={<LoopDetailPage />} />
        <Route path="executions/:id" element={<ExecutionPage />} />
        <Route path="runs/:id" element={<RunPage />} />
        <Route path="repos" element={<ReposPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
