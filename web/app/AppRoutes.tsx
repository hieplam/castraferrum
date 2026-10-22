// Router of the new UI (spec section 5): every path of the new screens inside the frame. Until a screen's task (U15 to U19)
// builds it, its path shows PendingRoute; an unknown path shows MissingRoute (Not found). Only add / change paths here.
import { Route, Routes } from 'react-router';
import { LoopsRoute } from '../pages/LoopsRoute';
import { MissingRoute } from '../pages/MissingRoute';
import { PendingRoute } from '../pages/PendingRoute';
import { SettingsRoute } from '../pages/SettingsRoute';
import { Frame } from './Frame';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Frame />}>
        <Route index element={<LoopsRoute />} />
        <Route path="loops/new" element={<PendingRoute />} />
        <Route path="loops/:id/edit" element={<PendingRoute />} />
        <Route path="loops/:id/runs" element={<PendingRoute />} />
        <Route path="loops/:id/settings" element={<PendingRoute />} />
        <Route path="loops/:id" element={<PendingRoute />} />
        <Route path="executions/:id" element={<PendingRoute />} />
        <Route path="runs/:id" element={<PendingRoute />} />
        <Route path="repos" element={<PendingRoute />} />
        <Route path="settings" element={<SettingsRoute />} />
        <Route path="*" element={<MissingRoute />} />
      </Route>
    </Routes>
  );
}
