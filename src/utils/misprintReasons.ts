import type { MisprintLearningScope, MisprintReason } from './collectionDB';

export interface MisprintReasonDefinition {
  value: MisprintReason;
  label: string;
  scope: MisprintLearningScope;
  description: string;
}

export const MISPRINT_REASONS: MisprintReasonDefinition[] = [
  { value: 'wrong_actor', label: 'Some Other Man™', scope: 'actor_identity', description: 'Not this actor. Block this image for the selected actor.' },
  { value: 'wrong_vibe', label: 'Technically Him, Spiritually Incorrect', scope: 'actor_vibe', description: 'Correct actor, wrong pack. Block only this actor × vibe pairing.' },
  { value: 'query_mismatch', label: 'The Search Has Wandered', scope: 'result_set', description: 'The producing spell wandered. Remove this result and retain query evidence.' },
  { value: 'misleading_metadata', label: 'Metadata Committed Perjury', scope: 'metadata_signal', description: 'The metadata claim is unreliable. Reduce trust in this evidence.' },
  { value: 'composite_or_collage', label: 'Nine Men in a Trench Coat', scope: 'global_asset', description: 'Composite or collage. Quarantine the asset everywhere.' },
  { value: 'bad_asset', label: 'Cursed Asset', scope: 'global_asset', description: 'Broken, tiny, corrupt, or unusable. Quarantine the asset everywhere.' },
  { value: 'duplicate', label: 'Same Man, Same Photo', scope: 'board', description: 'A board-relative duplicate. Replace it without teaching identity.' },
  { value: 'ranking_bug', label: 'The Machine Has Become Confused', scope: 'diagnostic', description: 'Product or ranking bug. Preserve engineering evidence, not taste calibration.' },
  { value: 'other', label: 'Other Misprint', scope: 'local', description: 'Remove locally and preserve the explanation without broad learning.' },
];

export function misprintReasonDefinition(reason: MisprintReason): MisprintReasonDefinition {
  return MISPRINT_REASONS.find(item => item.value === reason) ?? MISPRINT_REASONS[0];
}
