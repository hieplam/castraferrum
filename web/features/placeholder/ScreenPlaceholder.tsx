// Temporary empty screen of the 5-screen router: a title + one line "built in LC-xx". The screen's story replaces the page with the real screen
// and stops using this component; when no page uses it any more, delete the folder.
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Crumbs, Note, PaneHeader } from '../../ui/components';

export function ScreenPlaceholder({ screen, story, id }: { screen: MessageKey; story: string; id?: string }) {
  const t = useT();
  return (
    <>
      <Crumbs>{t('crumb.loops')}{id ? ` / ${id}` : ''}</Crumbs>
      <PaneHeader title={t(screen)} />
      <Note glyph="▍">{t('placeholder.screen', { story })}</Note>
    </>
  );
}
