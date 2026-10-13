import config from './playwright.config.js';
export default { ...config, use: { ...config.use, channel: undefined, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || '/usr/bin/chromium' } }, workers: 2, reporter: 'list' };
