export interface Ending {
  id: string;
  name: string;
  description: string;
  tactic: string;
  ally: string;
}
export const ENDINGS: readonly Ending[];
export const GAME_ID: string;
export const GAME_PATH: string;
export const GAME_URL: string;
export function endingById(id: string): Ending | null;
export function incomingEnding(search: string): Ending | null;
export const SCENES: readonly { title: string; text: string; choices: { label: string; consequence: string }[] }[];
export function sceneAt(index: number, trail: number[]): typeof SCENES[number] & { callbacks: string[] };
export function resolveRun(trail: number[]): Ending & { cause: string };
