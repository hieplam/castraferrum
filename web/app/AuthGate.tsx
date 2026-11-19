// The guard of every page of the frame (remote-access spec D5; task R5): while the console asks for sign-in and this browser
// holds no session, it sends the browser to `/signin?next=<path>`, so the app is never drawn behind the sign-in screen.
// Until the session is known it draws nothing; a server that cannot be reached draws the frame, which shows the lost connection.
import { Navigate, Outlet, useLocation } from 'react-router';
import { mustSignIn, signinHref, useSession } from '../data/auth';

export function AuthGate() {
  const session = useSession();
  const { pathname, search } = useLocation();
  if (session.isPending) return null;
  if (mustSignIn(session.data)) return <Navigate to={signinHref(pathname, search)} replace />;
  return <Outlet />;
}
