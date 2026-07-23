export interface GridItemData {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
  savedAt?: string;
  /** Optional tags for editorial detection heuristics */
  tags?: string[];
  /** Editorial set ID assigned by detection algorithm */
  editorialSetId?: string;
  batchKey?: string;
  gridPosition?: number;
}

export interface SaveState {
  [itemId: string]: boolean;
}

/** An editorial photoshoot set — a group of visually cohesive images */
export interface EditorialSet {
  id: string;
  label: string;
  itemIds: string[];
  poseVarietyScore: number; // 0-1, higher = more diverse poses
  cohesionScore: number;    // 0-1, higher = more visually cohesive
}
