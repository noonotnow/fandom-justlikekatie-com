import { useRef, useState } from 'react';
import type {
  CreatorDraftProgress,
  CreatorDraftResult,
  CreatorPlatform,
} from '../../utils/creatorDraft';
import {
  trackCreatorHandoffAttempt,
  trackCreatorHandoffFailure,
  trackCreatorHandoffSuccess,
  type CreatorHandoffEntryPoint,
} from '../../utils/analytics';
import styles from './CreatorPostAction.module.css';

const PLATFORMS: Array<{ value: CreatorPlatform; label: string; detail: string }> = [
  { value: 'rednote', label: 'Rednote', detail: '小红书' },
  { value: 'weibo', label: 'Weibo', detail: '微博' },
  { value: 'instagram', label: 'Instagram', detail: 'Instagram' },
];

interface Props {
  onSubmit: (
    platforms: CreatorPlatform[],
    onProgress: (progress: CreatorDraftProgress) => void,
  ) => Promise<CreatorDraftResult>;
  entryPoint: CreatorHandoffEntryPoint;
  disabled?: boolean;
  label?: string;
  onSuccess?: () => void;
}

/**
 * The Workstation handoff control owned exclusively by the Operator Console.
 * Selection and the in-flight lock stay centralized at that private boundary.
 */
export function CreatorPostAction({
  onSubmit,
  entryPoint,
  disabled = false,
  label = 'Make a post in Workstation',
  onSuccess,
}: Props) {
  const [selected, setSelected] = useState<CreatorPlatform[]>(['rednote']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<CreatorDraftProgress | null>(null);
  const [readinessFailures, setReadinessFailures] = useState<Array<{
    gridPosition: number;
    title: string;
    message: string;
  }>>([]);
  const [ready, setReady] = useState<CreatorDraftResult | null>(null);
  const inFlight = useRef(false);

  function toggle(platform: CreatorPlatform) {
    if (busy || disabled) return;
    setSelected(current => current.includes(platform)
      ? current.filter(value => value !== platform)
      : canonicalPlatforms([...current, platform]));
    setError('');
    setReady(null);
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
    setReadinessFailures([]);
    setReady(null);
    setProgress({ phase: 'preparing-media' });
    const destinations = canonicalPlatforms(selected);
    trackCreatorHandoffAttempt(entryPoint, destinations);
    try {
      const result = await onSubmit(destinations, setProgress);
      // completeCreatorDraftHandoff has validated this receipt before the
      // result reaches this shared action boundary.
      trackCreatorHandoffSuccess(entryPoint, result.source.platforms);
      onSuccess?.();
      setReady(result);
      setProgress(null);
      // The receipt has already been validated against the canonical
      // Workstation composer host by the handoff client.
      window.location.assign(result.receipt.deepLink);
    } catch (caught) {
      trackCreatorHandoffFailure(entryPoint, destinations, caught);
      setReadinessFailures(readinessFailuresFrom(caught));
      setError(recoveryMessage(caught));
      setProgress(null);
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
        {progress
          ? progressMessage(progress)
          : selectedLabels.length
          ? `Selected for this draft: ${selectedLabels.join(' + ')}`
          : 'Select at least one destination.'}
      </p>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || disabled || selected.length === 0}
      >
        {busy ? progressButtonLabel(progress) : ready ? 'Open Workstation draft' : label}
      </button>
      {ready && (
        <div className={styles.ready} role="status">
          <strong>{readyMessage(ready)}</strong>
          {ready.receipt.mediaSyncState === 'operator-diverged' && (
            <p>Workstation kept operator edits instead of replacing its media projection.</p>
          )}
          {ready.receipt.warnings.map(warning => <p key={warning}>{warning}</p>)}
          <a href={ready.receipt.deepLink}>Open the ready draft</a>
        </div>
      )}
      {error && (
        <div className={styles.recovery} role="alert">
          <p>{error}</p>
          <span>This grid is still saved.</span>
          {readinessFailures.length > 0 && (
            <ol className={styles.failures}>
              {readinessFailures.map(failure => (
                <li key={`${failure.gridPosition}:${failure.title}`}>
                  <strong>Position {failure.gridPosition + 1}: {failure.title}</strong>
                  <span>{failure.message}</span>
                </li>
              ))}
            </ol>
          )}
          <nav aria-label="Post recovery links">
            <button type="button" onClick={() => void submit()}>Retry preparation</button>
            <a href="/vibe-atlas?view=collection">Open Your Collection</a>
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
  if (/not durably available in MEDIA/i.test(message)) {
    return 'Workstation handoff is paused until every grid image is durably available.';
  }
  return message || 'The Workstation draft could not be created. Retry or open the saved grid below.';
}

function readinessFailuresFrom(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const failures = Reflect.get(value, 'failures');
  if (!Array.isArray(failures)) return [];
  return failures.filter(failure => (
    failure
    && typeof failure === 'object'
    && Number.isInteger(Reflect.get(failure, 'gridPosition'))
    && typeof Reflect.get(failure, 'title') === 'string'
    && typeof Reflect.get(failure, 'message') === 'string'
  ));
}

function progressMessage(progress: CreatorDraftProgress): string {
  if (progress.phase === 'preparing-media') return 'Preparing durable MEDIA assets…';
  if (progress.phase === 'syncing-collection') {
    return progress.copiedCount > 0
      ? `${progress.copiedCount} new MEDIA ${progress.copiedCount === 1 ? 'asset is' : 'assets are'} ready. Syncing Collection…`
      : 'Durable MEDIA assets are ready. Syncing Collection…';
  }
  return 'Collection is synced. Creating or updating the Workstation draft…';
}

function progressButtonLabel(progress: CreatorDraftProgress | null): string {
  if (progress?.phase === 'preparing-media') return 'Preparing assets…';
  if (progress?.phase === 'syncing-collection') return 'Syncing Collection…';
  return 'Creating or updating draft…';
}

function readyMessage(result: CreatorDraftResult): string {
  if (result.receipt.disposition === 'replayed') return 'Existing Workstation draft is ready to open.';
  if (result.receipt.disposition === 'updated') return 'Workstation draft was updated and is ready to open.';
  return 'New Workstation draft is ready to open.';
}