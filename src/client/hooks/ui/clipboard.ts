/**
 * Safe clipboard copy utility with fallback for sandboxed iframe environments
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Fall back to legacy execCommand
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}

/**
 * Read text from the clipboard, or null when the browser refused.
 *
 * There is no fallback, and there cannot be one: `execCommand('paste')` is
 * blocked by every browser and `navigator.clipboard.readText` needs a secure
 * context plus a permission the user grants once — so a denial is reported
 * rather than papered over with an empty paste.
 */
export async function readClipboardText(): Promise<string | null> {
  try {
    if (!navigator.clipboard || !window.isSecureContext) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
