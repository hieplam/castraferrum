// /signin (remote-access task R5): the sign-in screen while the console asks for sign-in and this browser holds no session.
// Signed in already, or a console that asks for none: straight on to `next` (a path of this console) or the Loops page.
import { Navigate, useSearchParams } from 'react-router';
import { mustSignIn, safeNext, useSession } from '../data/auth';
import { SignInView } from '../features/signin/SignInView';

export function SignInRoute() {
  const session = useSession();
  const [params] = useSearchParams();
  // Not known yet: nothing, so neither the form nor the app flashes. A server that cannot be reached shows the form.
  if (session.isPending) return null;
  if (session.data && !mustSignIn(session.data)) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <SignInView />;
}
