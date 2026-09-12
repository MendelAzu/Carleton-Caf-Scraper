const { chromium } = require('playwright');

const DEFAULT_URL = 'https://carleton.mydininghub.ca/en/location/teraanga-commons-dining-hall';
const STATION_NAME = 'The Grill 42';

function cleanText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

async function scrapeMenu(url = process.env.DINING_HALL_URL || DEFAULT_URL) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(() => document.body && /grill 42/i.test(document.body.innerText), null, { timeout: 30000 });
    await page.waitForTimeout(1500);

    const menu = await page.evaluate(() => {
      const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
      const isVisible = (element) => {
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0;
      };
      const isStationHeading = (element) => normalize(element.textContent).toLowerCase() === 'grill 42';
      const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
        .find((element) => isVisible(element) && isStationHeading(element));
      const anchorTarget = document.getElementById('295922');
      const stationLink = [...document.querySelectorAll('a')]
        .find((element) => normalize(element.textContent).toLowerCase() === 'grill 42' && /#295922$/.test(element.href));

      let root = anchorTarget || heading || stationLink;
      if (!root) return { found: false, items: [] };

      if (root === heading || root === stationLink) {
        root = root.closest('section, article, [data-testid], [class*="station"], [class*="Station"]') || root.parentElement;
      }
      if (root && root.id === '295922' && root.parentElement) {
        root = root.parentElement;
      }

      const candidates = [...root.querySelectorAll('ul[aria-label="Grill 42"] > li')]
        .filter(isVisible)
        .map((itemContainer) => {
          const nameElement = itemContainer.querySelector('h4,h5,h6,[role="heading"]');
          if (!nameElement || !isVisible(nameElement)) return null;
          const name = normalize(nameElement.textContent);
          const descriptionElement = itemContainer.querySelector('p,[class*="description"],[class*="Description"]');
          const description = descriptionElement ? normalize(descriptionElement.textContent) : '';
          return { name, description };
        })
        .filter(Boolean);

      const items = [];
      const seen = new Set();
      for (const candidate of candidates) {
        const key = candidate.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          items.push(candidate);
        }
      }
      return { found: true, items };
    });

    if (!menu.found) {
      throw new Error('The Grill 42 section could not be found on the dining hall page.');
    }

    return {
      station: STATION_NAME,
      items: menu.items,
      checkedAt: new Date().toISOString(),
      source: url
    };
  } catch (error) {
    console.error(`[scraper] ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeMenu, STATION_NAME, DEFAULT_URL };
