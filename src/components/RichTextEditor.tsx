import { useEffect, useRef, useState } from 'react';
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

const SIZE_PRESETS = [16, 20, 24, 28, 32, 40, 48, 64, 80] as const;

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
  const savedRange = useRef<Range | null>(null);
  const [sizeDraft, setSizeDraft] = useState('');

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

  function saveSelection() {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    savedRange.current = range.cloneRange();
  }

  function restoreSelection(): boolean {
    const el = ref.current;
    const range = savedRange.current;
    if (!el || !range) return false;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return false;
    try {
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch {
      return false;
    }
  }

  function selectAllContent() {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
    savedRange.current = range.cloneRange();
  }

  function onToolbar(cmd: Cmd) {
    restoreSelection();
    ref.current?.focus();
    run(cmd);
    saveSelection();
    emit();
  }

  function setColor(color: string) {
    restoreSelection();
    ref.current?.focus();
    document.execCommand('foreColor', false, color);
    saveSelection();
    emit();
  }

  /**
   * Apply font-size in px to the current selection (or all text if nothing selected).
   * Saves/restores selection so clicking the size field doesn't lose the range.
   */
  function setSizePx(raw: string) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 8 || n > 400) return;
    const el = ref.current;
    if (!el) return;

    el.focus();
    if (!restoreSelection()) {
      selectAllContent();
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      selectAllContent();
    }
    const active = window.getSelection();
    if (!active || active.rangeCount === 0) return;

    let range = active.getRangeAt(0);
    if (range.collapsed || !el.contains(range.commonAncestorContainer)) {
      selectAllContent();
      const again = window.getSelection();
      if (!again || again.rangeCount === 0) return;
      range = again.getRangeAt(0);
    }

    const span = document.createElement('span');
    span.style.fontSize = `${n}px`;
    try {
      range.surroundContents(span);
    } catch {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }

    // Place caret after the sized span
    const after = document.createRange();
    after.setStartAfter(span);
    after.collapse(true);
    active.removeAllRanges();
    active.addRange(after);
    savedRange.current = after.cloneRange();

    setSizeDraft(String(n));
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
        <label className="rte-color" title="צבע טקסט">
          <input
            type="color"
            defaultValue="#1c3140"
            onChange={(e) => setColor(e.target.value)}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
            }}
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

      <div className="rte-size-row">
        <span className="rte-size-label">גודל טקסט</span>
        <div className="rte-size-presets">
          {SIZE_PRESETS.map((px) => (
            <button
              key={px}
              type="button"
              className={`rte-size-chip${sizeDraft === String(px) ? ' on' : ''}`}
              title={`${px}px — סמן טקסט או החל על הכל`}
              onMouseDown={(e) => {
                e.preventDefault();
                saveSelection();
              }}
              onClick={() => setSizePx(String(px))}
            >
              {px}
            </button>
          ))}
        </div>
        <label className="rte-size" title="הזן גודל מותאם בפיקסלים">
          <input
            type="number"
            min={8}
            max={400}
            step={1}
            placeholder="מספר"
            dir="ltr"
            value={sizeDraft}
            onChange={(e) => setSizeDraft(e.target.value)}
            onMouseDown={(e) => {
              e.stopPropagation();
              saveSelection();
            }}
            onFocus={() => saveSelection()}
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
      </div>
      <p className="rte-size-hint">סמנו טקסט ולחצו גודל — בלי סימון יוחל על כל התוכן</p>

      <div
        ref={ref}
        className="rte-editor"
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        style={{ minHeight }}
        suppressContentEditableWarning
        onInput={() => {
          saveSelection();
          emit();
        }}
        onBlur={emit}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
