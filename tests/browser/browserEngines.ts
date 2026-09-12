import { existsSync } from 'node:fs';
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserType,
} from '@playwright/test';

export const BROWSER_ENGINES = [
  { name: 'Chromium', type: chromium },
  { name: 'Firefox', type: firefox },
  { name: 'WebKit', type: webkit },
] as const;

export async function launchBrowser(browserType: BrowserType = chromium): Promise<Browser> {
  try {
    return await browserType.launch();
  } catch (defaultLaunchError) {
    if (browserType !== chromium) throw defaultLaunchError;
    const executablePath = process.env.PATH
      ?.split(':')
      .map(directory => `${directory}/chromium`)
      .find(existsSync);
    if (!executablePath) throw defaultLaunchError;
    return chromium.launch({ executablePath, args: ['--no-sandbox'] });
  }
}