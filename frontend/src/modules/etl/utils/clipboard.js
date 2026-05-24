/**
 * Robust copy-to-clipboard utility with fallback for non-secure
 * or legacy browser environments (where navigator.clipboard is unavailable).
 */
export async function copyToClipboard(text) {
  if (!text) return false;

  // 1. Try modern Clipboard API
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Modern Clipboard API failed, trying fallback...', err);
  }

  // 2. Fallback: Textarea hack
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Ensure it's not visible or disruptive
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    
    textArea.focus();
    textArea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Clipboard fallback also failed:', err);
    return false;
  }
}
