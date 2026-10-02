import type { Browser, BrowserContext } from "playwright";

export const GUIDE_DESTINATIONS: ReadonlyArray<readonly [string, string]>;
export function prepareGuideSmokeContext(context: BrowserContext): Promise<void>;
export function checkRenderedHomepageGuides(browser: Browser, origin?: string): Promise<void>;