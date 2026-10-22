// Router of the new UI (spec section 5): every path of the new screens inside the frame. Until a screen's task (U14 to U19)
// builds it, its path shows MissingRoute. Only add / change paths here.
import { Route, Routes } from 'react-router';
import { MissingRoute } from '../pages/MissingRoute';
import { Frame } from './Frame';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Frame />}>
        <Route index element={<MissingRoute />} />
        <Route path="loops/new" element={<MissingRoute />} />
        <Route path="loops/:id/edit" element={<MissingRoute />} />
        <Route path="loops/:id/runs" element={<MissingRoute />} />
        <Route path="loops/:id/settings" element={<MissingRoute />} />
        <Route path="loops/:id" element={<MissingRoute />} />
        <Route path="executions/:id" element={<MissingRoute />} />
        <Route path="runs/:id" element={<MissingRoute />} />
        <Route path="repos" element={<MissingRoute />} />
        <Route path="settings" element={<MissingRoute />} />
        <Route path="*" element={<MissingRoute />} />
      </Route>
    </Routes>
  );
}
