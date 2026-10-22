// The new-UI switch (UI uplift, spec D17 and section 7): `?ui=new` opens the new UI and keeps it for this browser,
// `?ui=classic` brings the classic UI back, anything else keeps the stored choice. Without a choice, or when the
// browser blocks localStorage, the UI is classic: nothing changes for anyone who does not ask for the new one.
// web/main.tsx reads it once, before the first render. The file goes away with the classic UI (task U25).

export type UiVersion = 'classic' | 'new';
export type UiStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export const UI_STORAGE_KEY = 'castraferrum.ui';

export function uiVersion(
  location: { search: string } = window.location,
  storage: () => UiStorage = () => window.localStorage,
): UiVersion {
  try {
    const store = storage();
    const asked = new URLSearchParams(location.search).get('ui');
    if (asked === 'new') {
      store.setItem(UI_STORAGE_KEY, 'new');
      return 'new';
    }
    if (asked === 'classic') {
      store.removeItem(UI_STORAGE_KEY);
      return 'classic';
    }
    return store.getItem(UI_STORAGE_KEY) === 'new' ? 'new' : 'classic';
  } catch {
    return 'classic';
  }
}
