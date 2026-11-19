// The pure parts of sign-in in the web (remote-access task R5): when the sign-in screen shows, where it leads, the wait it
// shows, and the 401 handler of the query client.
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/loops-api';
import { mustSignIn, safeNext, signedInUser, signinHref, waitMinutes } from './auth';
import { qk } from './query-keys';
import { markSignedOut, onAuthError } from './session-cache';

describe('mustSignIn and signedInUser', () => {
  it('shows the sign-in screen only when the console asks for sign-in and this browser holds no session', () => {
    expect(mustSignIn({ required: true, signedIn: false })).toBe(true);
    expect(mustSignIn({ required: true, signedIn: true, username: 'owner' })).toBe(false);
    expect(mustSignIn({ required: false, signedIn: false })).toBe(false);
    expect(mustSignIn(undefined)).toBe(false);
  });

  it('names the user only when the console asks for sign-in and the browser is signed in', () => {
    expect(signedInUser({ required: true, signedIn: true, username: 'owner' })).toBe('owner');
    expect(signedInUser({ required: true, signedIn: false })).toBeNull();
    expect(signedInUser({ required: false, signedIn: false })).toBeNull();
    expect(signedInUser(undefined)).toBeNull();
  });
});

describe('signinHref and safeNext', () => {
  it('remembers the page that was asked for, with its query', () => {
    expect(signinHref('/loops/new')).toBe('/signin?next=%2Floops%2Fnew');
    expect(signinHref('/', '?tab=all')).toBe('/signin?next=%2F%3Ftab%3Dall');
    expect(signinHref('/')).toBe('/signin');
    expect(signinHref('/signin', '?next=%2Fx')).toBe('/signin');
  });

  it('leads only to a path of this console', () => {
    expect(safeNext('/loops/new')).toBe('/loops/new');
    expect(safeNext('/repos?x=1')).toBe('/repos?x=1');
    expect(safeNext(null)).toBe('/');
    expect(safeNext('')).toBe('/');
    expect(safeNext('https://example.invalid/')).toBe('/');
    expect(safeNext('//example.invalid/x')).toBe('/');
    expect(safeNext('/\\example.invalid')).toBe('/');
    expect(safeNext('/signin')).toBe('/');
    expect(safeNext('/signin?next=%2F')).toBe('/');
  });
});

describe('waitMinutes', () => {
  it('rounds the wait up to whole minutes, at least one', () => {
    expect(waitMinutes(690_000)).toBe(12);
    expect(waitMinutes(900_000)).toBe(15);
    expect(waitMinutes(60_000)).toBe(1);
    expect(waitMinutes(60_001)).toBe(2);
    expect(waitMinutes(1)).toBe(1);
    expect(waitMinutes(0)).toBe(1);
  });
});

describe('the 401 handler of the query client', () => {
  it('a 401 UNAUTHENTICATED ends the session in the cache; any other error leaves it', () => {
    const client = new QueryClient();
    client.setQueryData(qk.session(), { required: true, signedIn: true, username: 'owner' });
    onAuthError(client, new ApiError('NETWORK', 0, 'cannot reach'));
    onAuthError(client, new ApiError('LOOP_NOT_FOUND', 404, 'gone'));
    expect(client.getQueryData(qk.session())).toEqual({ required: true, signedIn: true, username: 'owner' });
    onAuthError(client, new ApiError('UNAUTHENTICATED', 401, 'sign in'));
    expect(client.getQueryData(qk.session())).toEqual({ required: true, signedIn: false });
  });

  it('marks a session that was never read as signed out on a console that asks for sign-in', () => {
    const client = new QueryClient();
    markSignedOut(client);
    expect(mustSignIn(client.getQueryData(qk.session()))).toBe(true);
  });
});
