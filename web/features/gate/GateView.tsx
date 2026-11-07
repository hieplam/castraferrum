// The gate page of a repo (goal G6, preview state `gate-queue`): the switch, the queue (running, queued and needs-ratification jobs) and
// the record (the last jobs that ended). A page pushed from the Repos tab: the phone keeps the tab bar under the navigation bar. Every
// state, step and order comes from the API.
import type { ReactNode } from 'react';
import { isApiError } from '../../api/loops-api';
import { useGate, useRatifyGateJob, useSetGateEnabled } from '../../data/gate';
import { browserTimeZone } from '../../data/overview';
import { useRepos } from '../../data/repos';
import type { MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Switch } from '../../ui/kit/Field';
import { Group, RowCell } from '../../ui/kit/Group';
import { PageHead } from '../../ui/kit/Layout';
import { errorTitle, PushedPage } from '../loop-detail/PushedPage';
import { JobCell } from './JobCell';

/** A captioned list of job cells, or the empty state of the list when it has none. */
function Jobs({ caption, testId, empty, children }: { caption: string; testId: string; empty: string; children: ReactNode[] }) {
  if (children.length > 0) {
    return (
      <Group caption={caption} testId={testId}>
        {children}
      </Group>
    );
  }
  return (
    <>
      <p className="group-cap">{caption}</p>
      <div className="empty" data-testid={`${testId}-empty`}>
        <b>{empty}</b>
      </div>
    </>
  );
}

export function GateView({ repoId }: { repoId: string }) {
  const t = useT();
  const tz = browserTimeZone();
  const gate = useGate(repoId);
  const repos = useRepos();
  const setEnabled = useSetGateEnabled(repoId);
  const ratify = useRatifyGateJob();
  const name = repos.data?.find((r) => r.id === repoId)?.name;
  const back = { to: '/repos', label: name === undefined ? t('nav.repos') : <span data-raw="">{name}</span>, testId: 'gate-back' };
  const now = new Date();

  if (gate.isError) {
    return (
      <PushedPage back={back} backlink={false} narrow>
        <div className="empty is-err" data-testid="gate-load-error" role="alert">
          <b>{errorTitle(t, gate.error, 'error.REPO_NOT_FOUND')}</b>
        </div>
      </PushedPage>
    );
  }
  const view = gate.data;
  const failure = setEnabled.error ?? ratify.error;
  return (
    <PushedPage back={back} narrow>
      <PageHead title={t('goalLoop.gate.title')} />
      <p className="page-desc">{t('goalLoop.gate.desc')}</p>
      {failure ? (
        <Banner tone="err" alert testId="gate-error">
          {t(`error.${isApiError(failure) ? failure.code : 'NETWORK'}` as MessageKey)}
        </Banner>
      ) : null}
      {view ? (
        <>
          <Group>
            <RowCell>
              <Switch on={view.enabled} testId="gate-switch" disabled={setEnabled.isPending} onToggle={() => setEnabled.mutate(!view.enabled)}>
                {t('goalLoop.gate.switch')}
              </Switch>
            </RowCell>
          </Group>
          <Jobs caption={t('goalLoop.gate.queue')} testId="gate-queue" empty={t('goalLoop.gate.queueEmpty')}>
            {view.queue.map((job) => (
              <JobCell key={job.id} job={job} repoId={repoId} tz={tz} now={now} busy={ratify.isPending} onRatify={(id) => ratify.mutate(id)} />
            ))}
          </Jobs>
          <Jobs caption={t('goalLoop.gate.record')} testId="gate-record" empty={t('goalLoop.gate.recordEmpty')}>
            {view.record.map((job) => (
              <JobCell key={job.id} job={job} repoId={repoId} tz={tz} now={now} busy={false} onRatify={() => undefined} />
            ))}
          </Jobs>
        </>
      ) : (
        <span className="skeleton is-block" aria-busy="true" />
      )}
    </PushedPage>
  );
}
