/**
 * Saves a file the page received to the device's downloads (FT-126: «Скачать все записи» in a browser). Inside
 * Telegram a page cannot download — the export goes to the chat with the bot there.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Some browsers read the URL after click() returns: let it go a little later
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
