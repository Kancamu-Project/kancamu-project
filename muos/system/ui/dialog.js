import { h } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { DIALOG_CLOSE_DELAY } from '../config/shell.js';

/**
 * Modal dialogs in the muOS "content dialog" style.
 *
 *   const { button, value } = await showDialog({
 *     title, message, content,            // content: optional DOM node below the message
 *     input: { value, placeholder, select: [start, end] },
 *     buttons: [{ id, label, primary, danger }],
 *     cancelId                             // id reported for Escape / click outside
 *   });
 */
export function showDialog({ title = '', message = '', content = null, input = null, buttons, cancelId, width } = {}) {
  const list = buttons?.length ? buttons : [{ id: 'ok', label: t('common.ok'), primary: true }];
  const cancel = cancelId ?? (list.find((b) => !b.primary) || list[list.length - 1]).id;
  const previous = document.activeElement;

  return new Promise((resolve) => {
    let field = null;
    const finish = (button) => {
      document.removeEventListener('keydown', onKey, true);
      smoke.classList.add('is-closing');
      const done = () => {
        smoke.remove();
        if (previous && previous.isConnected) {
          try {
            previous.focus({ preventScroll: true });
          } catch {
            /* ignore */
          }
        }
        resolve({ button, value: field ? field.value : undefined });
      };
      setTimeout(done, DIALOG_CLOSE_DELAY);
    };

    const body = h('div', { class: 'dialog-body' });
    if (title) body.append(h('h2', { class: 'dialog-title' }, title));
    if (message) body.append(h('p', { class: 'dialog-message' }, message));
    if (content) body.append(content);
    if (input) {
      field = h('input', {
        class: 'input dialog-input',
        type: 'text',
        value: input.value ?? '',
        placeholder: input.placeholder ?? '',
        spellcheck: false,
        autocomplete: 'off'
      });
      body.append(field);
    }

    const footer = h(
      'div',
      { class: 'dialog-footer' },
      list.map((b) =>
        h(
          'button',
          {
            class: `btn${b.primary ? ' btn-accent' : ''}${b.danger ? ' btn-danger' : ''}`,
            type: 'button',
            dataset: { id: b.id },
            onclick: () => finish(b.id)
          },
          b.label
        )
      )
    );

    const card = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || null, style: width ? { width: `${width}px` } : null }, body, footer);
    const smoke = h('div', { class: 'dialog-smoke' }, card);
    smoke.addEventListener('pointerdown', (e) => {
      if (e.target === smoke) finish(cancel);
    });
    smoke.addEventListener('contextmenu', (e) => e.preventDefault());

    function onKey(e) {
      if (!smoke.isConnected) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(cancel);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLTextAreaElement)) {
        const primary = list.find((b) => b.primary);
        if (primary) {
          e.preventDefault();
          e.stopPropagation();
          finish(primary.id);
        }
      } else if (e.key === 'Tab') {
        // keep the focus inside the dialog
        const focusable = [...card.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!card.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey, true);

    document.body.append(smoke);
    if (field) {
      field.focus();
      const [start, end] = input.select ?? [0, field.value.length];
      field.setSelectionRange(start, end);
    } else {
      (footer.querySelector('.btn-accent') || footer.querySelector('button'))?.focus();
    }
  });
}

/** Message with a single OK button. */
export async function alertDialog(title, message) {
  await showDialog({ title, message });
}

/** Resolves true when the user confirms. */
export async function confirmDialog(title, message, { okLabel, cancelLabel, danger = false } = {}) {
  const { button } = await showDialog({
    title,
    message,
    buttons: [
      { id: 'ok', label: okLabel ?? t('common.ok'), primary: true, danger },
      { id: 'cancel', label: cancelLabel ?? t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  return button === 'ok';
}

/** Resolves the entered text, or null when cancelled. */
export async function promptDialog(title, message, { value = '', placeholder = '', okLabel, select } = {}) {
  const { button, value: text } = await showDialog({
    title,
    message,
    input: { value, placeholder, select },
    buttons: [
      { id: 'ok', label: okLabel ?? t('common.ok'), primary: true },
      { id: 'cancel', label: t('common.cancel') }
    ],
    cancelId: 'cancel'
  });
  return button === 'ok' ? text : null;
}
