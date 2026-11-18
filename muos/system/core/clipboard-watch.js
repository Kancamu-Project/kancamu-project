/**
 * Notices what is copied on a page: the copy and cut commands, and the texts
 * and pictures that scripts put on the clipboard. `report` gets
 * { kind: 'text', text } or { kind: 'image', image: dataURL }.
 * Fields for passwords are left out.
 */
export function watchClipboard(report) {
  const selected = () => {
    const el = document.activeElement;
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && typeof el.selectionStart === 'number') {
      if (el instanceof HTMLInputElement && el.type === 'password') return '';
      return el.selectionStart === el.selectionEnd ? '' : el.value.slice(el.selectionStart, el.selectionEnd);
    }
    return String(document.getSelection?.() ?? '');
  };
  const onCopy = () => {
    const text = selected();
    if (text.trim()) report({ kind: 'text', text });
  };
  document.addEventListener('copy', onCopy, true);
  document.addEventListener('cut', onCopy, true);

  const clip = navigator.clipboard;
  if (!clip || clip.__watched) return;
  try {
    const writeText = clip.writeText?.bind(clip);
    if (writeText) {
      clip.writeText = (text) => {
        const done = writeText(text);
        // only what really reached the clipboard is remembered
        Promise.resolve(done).then(() => String(text).trim() && report({ kind: 'text', text: String(text) }), () => {});
        return done;
      };
    }
    const write = clip.write?.bind(clip);
    if (write) {
      clip.write = async (items) => {
        for (const item of items) {
          const type = item.types.find((name) => name.startsWith('image/'));
          if (type) {
            const blob = await item.getType(type);
            const image = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
            if (image) report({ kind: 'image', image });
          } else if (item.types.includes('text/plain')) {
            const text = await (await item.getType('text/plain')).text();
            if (text.trim()) report({ kind: 'text', text });
          }
        }
        return write(items);
      };
    }
    clip.__watched = true;
  } catch {
    /* the clipboard object cannot be changed: only copy and cut are seen */
  }
}
