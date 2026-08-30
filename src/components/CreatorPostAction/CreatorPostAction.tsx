import { useRef, useState } from 'react';
import type { CreatorDraftResult, CreatorPlatform } from '../../utils/creatorDraft';
import styles from './CreatorPostAction.module.css';

const PLATFORMS: Array<{ value: CreatorPlatform; label: string; detail: string }> = [
  { value: 'rednote', label: 'Rednote', detail: '小红书' },
  { value: 'weibo', label: 'Weibo', detail: '微博' },
  { value: 'instagram', label: 'Instagram', detail: 'Instagram' },
];

interface Props {
  onSubmit: (platforms: CreatorPlatform[]) => Promise<CreatorDraftResult>;
  disabled?: boolean;
  label?: string;
  onSuccess?: () => void;
}

/**
 * The single operator-facing entry point for a Vibe Atlas post.
 * Keeping selection and the in-flight lock here prevents Daily, Collection,
 * and Builder from drifting into different platform behavior.
 */
export function CreatorPostAction({
  onSubmit,
  disabled = false,
  label = 'Make a post in Workstation',
  onSuccess,
}: Props) {
  const [selected, setSelected] = useState<CreatorPlatform[]>(['rednote']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  function toggle(platform: CreatorPlatform) {
    if (busy || disabled) return;
    setSelected(current => current.includes(platform)
      ? current.filter(value => value !== platform)
      : canonicalPlatforms([...current, platform]));
    setError('');
  }

  async function submit() {
    if (inFlight.current || busy || disabled) return;
    if (selected.length === 0) {
      setError('Select Rednote, Weibo, Instagram, or any combination before continuing.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onSubmit(canonicalPlatforms(selected));
      onSuccess?.();
      // The receipt has already been validated against the canonical
      // Workstation/Creator composer host by the handoff client.
      window.location.assign(result.receipt.createUrl);
    } catch (caught) {
      setError(recoveryMessage(caught));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const selectedLabels = PLATFORMS
    .filter(platform => selected.includes(platform.value))
    .map(platform => platform.label);

  return (
    <div className={styles.action}>
      <fieldset disabled={busy || disabled}>
        <legend>Post destinations</legend>
        <div className={styles.options}>
          {PLATFORMS.map(platform => (
            <label key={platform.value} className={styles.option}>
              <input
                type="checkbox"
                checked={selected.includes(platform.value)}
                onChange={() => toggle(platform.value)}
              />
              <span><strong>{platform.label}</strong><small>{platform.detail}</small></span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={styles.confirmation} role="status" aria-live="polite">
        {selectedLabels.length
          ? `Selected for this draft: ${selectedLabels.join(' + ')}`
          : 'Select at least one destination.'}
      </p>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || disabled || selected.length === 0}
      >
        {busy ? 'Creating draft…' : label}
      </button>
      {error && (
        <div className={styles.recovery} role="alert">
          <p>{error}</p>
          <span>This grid is still saved.</span>
          <nav aria-label="Post recovery links">
            <a href="/vibe-atlas?view=collection">Open Studio Operations</a>
            <a href="https://workstation.justlikekatie.com" target="_blank" rel="noreferrer">Open Workstation</a>
          </nav>
        </div>
      )}
    </div>
  );
}

function canonicalPlatforms(platforms: CreatorPlatform[]): CreatorPlatform[] {
  return ['rednote', 'weibo', 'instagram']
    .filter(platform => platforms.includes(platform as CreatorPlatform)) as CreatorPlatform[];
}

function recoveryMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : '';
  if (/invalid json|unreadable|html|protocol/i.test(message)) {
    return 'Workstation returned an unreadable draft receipt. Retry when the intake is available.';
  }
  if (/timeout|timed out|abort|could not be reached|network/i.test(message)) {
    return 'Workstation did not respond in time. Retry when the intake is available.';
  }
  if (/rejected|returned http|intake failed|handoff failed/i.test(message)) {
    return 'Workstation rejected this draft handoff. Retry after checking the intake configuration.';
  }
  return message || 'The Workstation draft could not be created. Retry or open the saved grid below.';
}