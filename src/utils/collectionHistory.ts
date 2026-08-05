import { dbGetAllGrids, dbSaveGrid, type GridRecord } from './collectionDB';
import { dbGetAllPlanItems } from './planDB';
import { legacyGridFromPlan } from './collectionHistoryModel';

export { cardStableResultId, collectionGridFromStar, legacyGridFromPlan } from './collectionHistoryModel';

export async function migrateLegacyGridHistory(): Promise<number> {
  const [existing, planItems] = await Promise.all([dbGetAllGrids(), dbGetAllPlanItems()]);
  const known = new Set(existing.map(grid => grid.id));
  const legacy = planItems
    .map(legacyGridFromPlan)
    .filter((grid): grid is GridRecord => grid !== null)
    .filter(grid => !known.has(grid.id));
  await Promise.all(legacy.map(dbSaveGrid));
  return legacy.length;
}
