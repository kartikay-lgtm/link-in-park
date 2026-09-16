'use client';

import { useState } from 'react';
import Icon from './Icon';

/* Copies `text`. `icon` renders a compact icon-only button (with a tooltip);
   otherwise a labelled ghost button. */
export default function CopyButton({ text, label = 'Copy', small = true, icon = false, title, iconName = 'copy' }: { text: string; label?: string; small?: boolean; icon?: boolean; title?: string; iconName?: 'copy' | 'link' | 'external' }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1400);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
  if (icon) {
    return (
      <button type="button" className="btn btn-icon" onClick={copy} disabled={!text} title={done ? 'Copied' : (title || label)} aria-label={title || label}
        style={done ? { color: 'var(--ok)' } : undefined}>
        <Icon name={done ? 'check' : iconName} size={15} />
      </button>
    );
  }
  return (
    <button type="button" className={`btn btn-outline ${small ? 'btn-sm' : ''}`} onClick={copy} disabled={!text} title={text}>
      <Icon name={done ? 'check' : 'copy'} size={14} />{done ? 'Copied' : label}
    </button>
  );
}
