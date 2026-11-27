// The one User-Agent that every server fetch sends (fetchText in lib/net.js):
// the feed, its chapters file, the song feeds and Podcast Index.
// Form: `<AppName>/<version> (+<link>)`, no email, no browser imitation.
// The version comes from package.json; the link is the live site.
//
// Until 2026-11-27 it was `HGH-Checker/2.0 (+https://github.com/ChadFarrow/HGH-checker)`,
// written by hand. Every probed host gave the same answer for both names that day.
import { createRequire } from 'node:module';

const { version } = createRequire(import.meta.url)('../package.json');

export const APP_NAME = 'HGH-Checker';
export const APP_VERSION = version;
export const APP_LINK = 'https://hgh-checker.vercel.app';
export const USER_AGENT = `${APP_NAME}/${APP_VERSION} (+${APP_LINK})`;
