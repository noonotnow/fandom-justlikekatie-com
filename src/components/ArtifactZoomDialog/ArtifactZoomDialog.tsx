import { useEffect, useId, useRef } from 'react';
import styles from './ArtifactZoomDialog.module.css';

interface ZoomImage {
  src: string;
  alt: string;
}

interface Props {
  title: string;
  subtitle?: string;
  images: ZoomImage[];
  footer?: string;
  singleImage?: boolean;
  onClose: () => void;
}

export const ArtifactZoomDialog: React.FC<Props> = ({
  title,
  subtitle,
  images,
  footer,
  singleImage = false,
  onClose,
}) => {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const composition = singleImage || images.length === 1
    ? styles.singleImage
    : images.length === 4
      ? styles.twoByTwo
      : images.length === 6
        ? styles.twoByThree
      : images.length === 12
        ? styles.fourByThree
        : styles.threeByThree;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" aria-label="Close enlarged view" onClick={onClose}>×</button>
        </header>
        <div className={`${styles.visual} ${composition}`}>
          {images.slice(0, 12).map((image, index) => (
            <img key={`${image.src}:${index}`} src={image.src} alt={singleImage ? image.alt : ''} />
          ))}
        </div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
};
