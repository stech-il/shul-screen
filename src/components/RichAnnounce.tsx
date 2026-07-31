import { sanitizeAnnounceHtml } from '../lib/sanitizeHtml';
import './RichAnnounce.css';

type Props = {
  html: string;
  className?: string;
};

/** Renders announcement HTML with formatting preserved (bold, color, lists, etc.). */
export function RichAnnounce({ html, className = '' }: Props) {
  return (
    <div
      className={`rich-announce ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: sanitizeAnnounceHtml(html) }}
    />
  );
}
