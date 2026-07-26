import { useEffect, useRef } from 'react';
import { sanitizeRichHtml } from '../lib/sanitizeHtml';
import './RichTextEditor.css';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  minHeight?: string;
}

type Cmd =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'justifyRight'
  | 'justifyCenter'
  | 'justifyLeft'
  | 'removeFormat';

function run(cmd: Cmd, value?: string) {
  document.execCommand(cmd, false, value);
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'כתוב כאן…',
  dir = 'rtl',
  minHeight = '7rem',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current && el.innerHTML) return;
    const next = sanitizeRichHtml(value);
    if (el.innerHTML !== next) {
      el.innerHTML = next || '';
    }
    lastEmitted.current = value;
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichHtml(el.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }

  function onToolbar(cmd: Cmd) {
    ref.current?.focus();
    run(cmd);
    emit();
  }

  function setColor(color: string) {
    ref.current?.focus();
    document.execCommand('foreColor', false, color);
    emit();
  }

  /**
   * Apply an absolute font-size in px to the current selection.
   * Uses the classic fontSize=7 trick, then rewrites those <font> tags
   * to <span style="font-size:Npx"> so the value survives sanitize + display.
   */
  function setSizePx(raw: string) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 8 || n > 400) return;
    const el = ref.current;
    if (!el) return;
    el.focus();

    // Mark selected text with a temporary size-7 font tag.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand('fontSize', false, '7');

    el.querySelectorAll('font[size="7"]').forEach((font) => {
      const span = document.createElement('span');
      span.style.fontSize = `${n}px`;
      // Preserve nested markup from the selection.
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });

    emit();
  }

  return (
    <div className="rte" dir={dir}>
      <div className="rte-toolbar" role="toolbar" aria-label="עיצוב טקסט">
        <button type="button" className="rte-btn" title="מודגש" onClick={() => onToolbar('bold')}>
          <strong>B</strong>
        </button>
        <button type="button" className="rte-btn" title="נטוי" onClick={() => onToolbar('italic')}>
          <em>I</em>
        </button>
        <button type="button" className="rte-btn" title="קו תחתון" onClick={() => onToolbar('underline')}>
          <span className="rte-u">U</span>
        </button>
        <button
          type="button"
          className="rte-btn"
          title="קו חוצה"
          onClick={() => onToolbar('strikeThrough')}
        >
          <s>S</s>
        </button>
        <span className="rte-sep" />
        <button
          type="button"
          className="rte-btn"
          title="יישור לימין"
          onClick={() => onToolbar('justifyRight')}
        >
          ימין
        </button>
        <button
          type="button"
          className="rte-btn"
          title="מרכז"
          onClick={() => onToolbar('justifyCenter')}
        >
          מרכז
        </button>
        <button
          type="button"
          className="rte-btn"
          title="יישור לשמאל"
          onClick={() => onToolbar('justifyLeft')}
        >
          שמאל
        </button>
        <span className="rte-sep" />
        <button
          type="button"
          className="rte-btn"
          title="רשימה"
          onClick={() => onToolbar('insertUnorderedList')}
        >
          • רשימה
        </button>
        <button
          type="button"
          className="rte-btn"
          title="רשימה ממוספרת"
          onClick={() => onToolbar('insertOrderedList')}
        >
          1. רשימה
        </button>
        <span className="rte-sep" />
        <label className="rte-size" title="גודל פונט בפיקסלים — סמן טקסט והזן ערך">
          <span className="rte-size-label">גודל</span>
          <input
            type="number"
            min={8}
            max={400}
            step={1}
            placeholder="px"
            dir="ltr"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setSizePx((e.target as HTMLInputElement).value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value.trim()) setSizePx(e.target.value);
            }}
          />
          <span className="rte-size-unit">px</span>
        </label>
        <label className="rte-color" title="צבע טקסט">
          <input
            type="color"
            defaultValue="#1c3140"
            onChange={(e) => setColor(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
        <button
          type="button"
          className="rte-btn"
          title="נקה עיצוב"
          onClick={() => onToolbar('removeFormat')}
        >
          נקה
        </button>
      </div>
      <div
        ref={ref}
        className="rte-editor"
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        style={{ minHeight }}
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
