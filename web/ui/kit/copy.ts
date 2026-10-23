// Copy text to the clipboard, also over plain HTTP (spec D15). `navigator.clipboard` exists only in a secure context (https or
// localhost); a phone that opens the console at http://<ip> has none, so the copy goes through a hidden textarea and
// `document.execCommand('copy')` there.

export type CopyMethod = 'clipboard' | 'textarea';

/** The clipboard API in a secure context that has it; the textarea otherwise. */
export function copyMethod(isSecureContext: boolean, hasClipboard: boolean): CopyMethod {
  return isSecureContext && hasClipboard ? 'clipboard' : 'textarea';
}

function copyWithTextarea(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // Out of sight and out of the layout for the instant it exists.
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** Copies `text`; `true` when it was copied. A clipboard the browser refuses falls back to the textarea. */
export async function copyText(text: string): Promise<boolean> {
  if (copyMethod(window.isSecureContext, typeof navigator.clipboard?.writeText === 'function') === 'clipboard') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return copyWithTextarea(text);
    }
  }
  return copyWithTextarea(text);
}
