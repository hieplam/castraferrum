/**
 * Variables for a program that a background service runs and that can ask for a login.
 * `GIT_TERMINAL_PROMPT=0` stops git from asking on a terminal. `GCM_INTERACTIVE=never` stops Git Credential Manager
 * from opening a window. `GH_PROMPT_DISABLED=1` stops `gh` from asking. A stored login still works: no helper is unset.
 * Without a stored login the program fails at once, and the service reports the failure.
 */
export const NO_LOGIN_PROMPT_ENV: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GH_PROMPT_DISABLED: '1',
};
