// A path that is not one of the 5 screens.
import { useLocation, useNavigate } from 'react-router';
import { useT } from '../prefs/prefs';
import { Button, EmptyState } from '../ui/components';

export function NotFoundPage() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <EmptyState glyph="∅" title={t('notFound.page.title')} error action={<Button onClick={() => navigate('/')}>{t('notFound.page.home')}</Button>}>
      <span className="mono">{t('notFound.page.body', { path: pathname })}</span>
    </EmptyState>
  );
}
