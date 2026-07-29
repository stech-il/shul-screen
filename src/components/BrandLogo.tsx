import './BrandLogo.css';

type Size = 'sm' | 'md' | 'lg' | 'hero';

type Props = {
  size?: Size;
  /** Show text next to mark (useful in dense headers) */
  withWordmark?: boolean;
  className?: string;
};

const SRC = './screensmart-mark.png';

/**
 * Product brand mark — digital synagogue screen logo.
 */
export function BrandLogo({ size = 'md', withWordmark = false, className = '' }: Props) {
  return (
    <span className={`brand-logo brand-logo--${size} ${className}`.trim()}>
      <img src={SRC} alt="" width={160} height={160} decoding="async" />
      {withWordmark ? <span className="brand-logo-word">screensmart</span> : null}
      <span className="brand-logo-sr">screensmart</span>
    </span>
  );
}
