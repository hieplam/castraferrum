// The sign-in screen (remote-access spec D13, approved preview states `signin`, `signin-error`, `signin-locked`, `vi-signin`;
// design/ds/SYSTEM.md, Sign-in). It is the one screen outside the app frame (`.signin`): no top bar, no tab bar. The errors belong
// to the form, never to one field: wrong credentials are a `.banner.is-err` (the username stays, the password is cleared); too
// many attempts are a `.banner.is-warn` with the wait in whole minutes from the server's `Retry-After`, and Sign in stays
// disabled until the wait is over. Built from the kit's field, button and banner, and the `.card` of the system.
import { useEffect, useState, type FormEvent } from 'react';
import { isApiError } from '../../api/loops-api';
import { useNow } from '../../data/connection';
import { useLogin, waitMinutes } from '../../data/auth';
import { MESSAGES, type MessageKey } from '../../prefs/messages';
import { useT } from '../../prefs/prefs';
import { Banner } from '../../ui/kit/Banner';
import { Button } from '../../ui/kit/Button';
import { Input } from '../../ui/kit/Field';

type Failure = { kind: 'invalid' } | { kind: 'locked'; until: number } | { kind: 'other'; text: MessageKey };

export function SignInView() {
  const t = useT();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const now = useNow(1_000).getTime();
  const locked = failure?.kind === 'locked' && failure.until > now;

  // The wait is over: Sign in works again.
  useEffect(() => {
    if (failure?.kind === 'locked' && failure.until <= now) setFailure(null);
  }, [failure, now]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (locked || login.isPending) return;
    // An empty field is not sent: the first empty one takes the focus.
    const empty = username === '' ? 'signin-username' : password === '' ? 'signin-password' : null;
    if (empty) {
      document.getElementById(empty)?.focus();
      return;
    }
    login.mutate(
      { username, password },
      {
        onError: (err) => {
          setPassword('');
          if (isApiError(err, 'TOO_MANY_ATTEMPTS')) setFailure({ kind: 'locked', until: Date.now() + (err.retryAfterSec ?? 60) * 1_000 });
          else if (isApiError(err, 'INVALID_CREDENTIALS')) setFailure({ kind: 'invalid' });
          else setFailure({ kind: 'other', text: errorKey(err) });
        },
      },
    );
  };

  const minutes = failure?.kind === 'locked' ? waitMinutes(failure.until - now) : 0;
  const banner =
    failure === null ? null : failure.kind === 'locked' ? (
      locked ? (
        <Banner tone="warn" alert testId="signin-error" data={{ 'data-code': 'TOO_MANY_ATTEMPTS' }}>
          {t.node(minutes === 1 ? 'signin.locked.one' : 'signin.locked.other', { n: <span className="data">{minutes}</span> })}
        </Banner>
      ) : null
    ) : failure.kind === 'invalid' ? (
      <Banner tone="err" alert testId="signin-error" data={{ 'data-code': 'INVALID_CREDENTIALS' }}>
        {t('signin.invalid')}
      </Banner>
    ) : (
      <Banner tone="err" alert testId="signin-error">
        {t(failure.text)}
      </Banner>
    );

  return (
    <main className="signin">
      <form className="signin-form" data-testid="signin-form" method="post" noValidate onSubmit={onSubmit}>
        <span className="signin-brand">{t('app.title')}</span>
        <h1 className="page-title">{t('signin.title')}</h1>
        <p className="page-desc">{t('signin.desc')}</p>
        <div className="card is-pad">
          {banner}
          <div className="field">
            <label className="label" htmlFor="signin-username">
              {t('signin.username')}
            </label>
            <Input id="signin-username" autoComplete="username" value={username} onChange={setUsername} />
          </div>
          <div className="field">
            <label className="label" htmlFor="signin-password">
              {t('signin.password')}
            </label>
            <Input id="signin-password" type="password" autoComplete="current-password" value={password} onChange={setPassword} />
          </div>
          <Button type="submit" variant="primary" size="lg" block disabled={locked} aria-busy={login.isPending || undefined} data-testid="signin-submit">
            {t('signin.submit')}
          </Button>
        </div>
        <p className="note">{t('signin.note')}</p>
      </form>
    </main>
  );
}

/** The text of any other failure (the server cannot be reached, a server error): the code's own text when en.ts has one. */
function errorKey(err: unknown): MessageKey {
  const key = isApiError(err) ? `error.${err.code}` : 'error.NETWORK';
  return key in MESSAGES.en ? (key as MessageKey) : 'error.NETWORK';
}
