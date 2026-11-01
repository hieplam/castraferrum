// The Settings page (spec 5.8, `m-settings-light`): Appearance (theme, language), Connection (server, database, console address),
// This device (Add to Home Screen, phone only) and About (version). Every row is a cell of an inset list.
import { Link } from 'react-router';
import { useSharedServerStatus } from '../../data/connection';
import { useScoreboard } from '../../data/scoreboard';
import { MESSAGES, type Lang } from '../../prefs/messages';
import { usePrefs, useT } from '../../prefs/prefs';
import { FieldCell, Segmented } from '../../ui/kit/Field';
import { Cell, Group } from '../../ui/kit/Group';
import { Icon } from '../../ui/kit/Icon';
import { Page, PageHead, useLayout } from '../../ui/kit/Layout';

const THEMES = ['auto', 'light', 'dark'] as const;
const LANGS: readonly Lang[] = ['en', 'vi'];

export function SettingsView() {
  const t = useT();
  const { lang, themeChoice, setLang, setThemeChoice } = usePrefs();
  const status = useSharedServerStatus();
  const layout = useLayout();
  // The entry to the scoreboard shows only when a cause repeated in the last 30 days: a failed request or no cause hides it.
  const scoreboard = useScoreboard();
  const hasCauses = (scoreboard.data?.figures.causes ?? 0) > 0;

  const serverOk = status.server === 'ok';
  const dbText = status.db === 'ok' ? t('settings.answering') : status.db === 'down' ? t('settings.notAnswering') : t('conn.lost');

  return (
    <Page narrow>
      <PageHead title={t('settings.title')} large />
      <Group caption={t('settings.appearance')}>
        <FieldCell label={t('settings.theme')}>
          <Segmented
            label={t('settings.theme')}
            testId="settings-theme"
            value={themeChoice ?? 'auto'}
            options={THEMES.map((x) => ({ value: x, label: t(`settings.theme.${x}`), testId: `settings-theme-${x}` }))}
            onChange={(x) => setThemeChoice(x === 'auto' ? null : x)}
          />
        </FieldCell>
        <FieldCell label={t('settings.language')}>
          <Segmented
            label={t('settings.language')}
            testId="settings-lang"
            value={lang}
            options={LANGS.map((l) => ({
              value: l,
              // Each language names itself, from its own locale file, so the label is the same in every UI language.
              label: (
                <span lang={l} data-raw="">
                  {MESSAGES[l]['settings.lang.self']}
                </span>
              ),
              testId: `settings-lang-${l}`,
            }))}
            onChange={setLang}
          />
        </FieldCell>
      </Group>
      <Group caption={t('settings.connection')}>
        <Cell testId="settings-server" plain title={t('settings.server')} dot={serverOk ? 'ok' : status.server === 'down' ? 'fail' : 'idle'} value={serverOk ? t('settings.connected') : t('conn.lost')} />
        <Cell testId="settings-db" plain title={t('settings.database')} dot={status.db === 'ok' ? 'ok' : status.db === 'down' ? 'fail' : 'idle'} value={dbText} />
        <Cell testId="settings-address" plain title={t('settings.address')} meta={window.location.origin} metaData />
      </Group>
      {layout === 'phone' ? (
        <Group caption={t('settings.device')}>
          <Cell plain title={t('settings.homeScreen')} meta={t('settings.homeScreenHow')} />
        </Group>
      ) : null}
      <Group caption={t('settings.about')}>
        <Cell testId="settings-version" plain title={t('settings.version')} value={__APP_VERSION__} valueData />
      </Group>
      {hasCauses ? (
        <Group testId="settings-score">
          <Link className="cell is-link" to="/scoreboard" data-testid="settings-score-link">
            <span className="cell-main">{t('goalLoop.score.link')}</span>
            <Icon name="chev" className="chev" />
          </Link>
        </Group>
      ) : null}
    </Page>
  );
}
