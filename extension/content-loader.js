(async () => {
  try {
    await import(chrome.runtime.getURL('dist/content/main.content.js'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[alpha-auto-bot] Failed to load content module', error);
  }
})();
