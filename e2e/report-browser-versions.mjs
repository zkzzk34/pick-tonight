import { chromium, firefox, webkit } from "@playwright/test";

const browsers = [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
];

for (const [name, browserType] of browsers) {
  const browser = await browserType.launch();

  try {
    console.log(`${name}=${browser.version()}`);
  } finally {
    await browser.close();
  }
}
