export interface GridItemData {
  id: string;
  title: string;
  thumbnail: string;
  publisher?: string;
  url: string;
  savedAt?: string;
}

export interface SaveState {
  [itemId: string]: boolean;
}
