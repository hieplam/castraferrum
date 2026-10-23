// Router of the new UI (spec section 5): every path of the new screens inside the frame; an unknown path shows MissingRoute
// (Not found). Only add / change paths here.
import { Route, Routes } from 'react-router';
import { EditorRoute } from '../pages/EditorRoute';
import { LoopRoute } from '../pages/LoopRoute';
import { LoopRunsRoute } from '../pages/LoopRunsRoute';
import { LoopSettingsRoute } from '../pages/LoopSettingsRoute';
import { LoopsRoute } from '../pages/LoopsRoute';
import { MissingRoute } from '../pages/MissingRoute';
import { PeriodRoute } from '../pages/PeriodRoute';
import { ReposRoute } from '../pages/ReposRoute';
import { RunRoute } from '../pages/RunRoute';
import { SettingsRoute } from '../pages/SettingsRoute';
import { Frame } from './Frame';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Frame />}>
        <Route index element={<LoopsRoute />} />
        <Route path="loops/new" element={<EditorRoute />} />
        <Route path="loops/:id/edit" element={<EditorRoute />} />
        <Route path="loops/:id/runs" element={<LoopRunsRoute />} />
        <Route path="loops/:id/settings" element={<LoopSettingsRoute />} />
        <Route path="loops/:id" element={<LoopRoute />} />
        <Route path="executions/:id" element={<PeriodRoute />} />
        <Route path="runs/:id" element={<RunRoute />} />
        <Route path="repos" element={<ReposRoute />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route path="*" element={<MissingRoute />} />
      </Route>
    </Routes>
  );
}
