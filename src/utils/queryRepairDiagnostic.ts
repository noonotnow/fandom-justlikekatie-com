type RecordValue = Record<string, any>;

export function assembleQueryRepairDiagnostic(
  manifest: RecordValue,
  fetched: RecordValue[],
  testedAt = new Date().toISOString(),
) {
  const baseline = (manifest.baselineQueries ?? []).map((query: string, rungIndex: number) => {
    const item = fetched.find(candidate =>
      candidate.kind === 'baseline'
      && candidate.rungIndex === rungIndex
      && candidate.query === query)
      ?? fetched.find(candidate =>
        candidate.fetchIndex === rungIndex
        && (!candidate.search || candidate.query === query));
    return item?.search
      ? item
      : { kind: 'baseline', rungIndex, query, error: item?.error ?? 'Baseline search did not return a result.' };
  });
  const alternatives = (manifest.alternatives ?? []).map((alternative: RecordValue, alternativeIndex: number) => {
    const fetchIndex = (manifest.baselineQueries?.length ?? 0) + alternativeIndex;
    const item = fetched.find(candidate =>
      candidate.kind === 'alternative'
      && candidate.alternativeIndex === alternativeIndex
      && candidate.rungIndex === alternative.rungIndex
      && candidate.query === alternative.query)
      ?? fetched.find(candidate =>
        candidate.fetchIndex === fetchIndex
        && (!candidate.search || (
          candidate.rungIndex === alternative.rungIndex
          && candidate.query === alternative.query
        )));
    return item?.search
      ? item
      : {
          kind: 'alternative',
          alternativeIndex,
          rungIndex: alternative.rungIndex,
          query: alternative.query,
          error: item?.error ?? 'Alternative search did not return a result.',
        };
  });
  const identitySet = (item: RecordValue) =>
    new Set<string>((item?.search?.resultIdentities ?? []).map((result: RecordValue) => result.identity));
  const summarize = (queries: RecordValue[]) => {
    const complete = queries.length === (manifest.baselineQueries?.length ?? 0)
      && queries.every(item => item.search && !item.error && !item.search.resultIdentityCapture?.truncated);
    if (!complete) {
      return {
        rungs: queries.map(item => ({ ...item, metrics: null })),
        uniqueImageIdentityCount: null,
        complete: false,
      };
    }
    const seen = new Set<string>();
    const rungs = queries.map(item => {
      const identities = identitySet(item);
      const incremental = [...identities].filter(identity => !seen.has(identity)).length;
      for (const identity of identities) seen.add(identity);
      return {
        ...item,
        metrics: {
          uniqueCount: identities.size,
          incrementalUniqueCount: incremental,
          overlapWithEarlierCount: identities.size - incremental,
        },
      };
    });
    return { rungs, uniqueImageIdentityCount: seen.size, complete: true };
  };
  const baselineSummary = summarize(baseline);
  const experiments = (manifest.alternatives ?? []).map((alternative: RecordValue, index: number) => {
    const candidate = alternatives[index];
    const replacementQueries = baseline.map((item: RecordValue, rungIndex: number) =>
      rungIndex === alternative.rungIndex ? candidate : item);
    const summary = summarize(replacementQueries);
    const baselineRung = baselineSummary.rungs[alternative.rungIndex]?.metrics;
    const replacementRung = summary.rungs[alternative.rungIndex]?.metrics;
    return {
      ...alternative,
      search: candidate?.search ?? null,
      error: baselineSummary.complete ? candidate?.error ?? null : 'Baseline query set is incomplete.',
      baselineIncrementalUniqueCount: baselineRung?.incrementalUniqueCount ?? null,
      replacementIncrementalUniqueCount: replacementRung?.incrementalUniqueCount ?? null,
      baselineUniqueImageIdentityCount: baselineSummary.uniqueImageIdentityCount,
      replacementUniqueImageIdentityCount: summary.uniqueImageIdentityCount,
      uniqueYieldDelta: baselineSummary.uniqueImageIdentityCount != null && summary.uniqueImageIdentityCount != null
        ? summary.uniqueImageIdentityCount - baselineSummary.uniqueImageIdentityCount
        : null,
      improvesIncrementalYield: baselineRung && replacementRung
        ? replacementRung.incrementalUniqueCount > baselineRung.incrementalUniqueCount
        : null,
      qualifies: baselineRung && replacementRung
        && baselineSummary.uniqueImageIdentityCount != null
        && summary.uniqueImageIdentityCount != null
        ? replacementRung.incrementalUniqueCount > baselineRung.incrementalUniqueCount
          && summary.uniqueImageIdentityCount > baselineSummary.uniqueImageIdentityCount
        : null,
    };
  });
  return { ...manifest, testedAt, baseline: baselineSummary, experiments };
}