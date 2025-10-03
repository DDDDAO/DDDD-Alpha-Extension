export interface LocateTabOptions {
  url: string;
  createIfMissing?: boolean;
}

export async function locateOrCreateTab({
  url,
  createIfMissing = true,
}: LocateTabOptions): Promise<chrome.tabs.Tab | undefined> {
  const patterns = buildQueryPatterns(url);
  const queryInfo: chrome.tabs.QueryInfo = patterns.length > 0 ? { url: patterns } : { url };
  const matchingTabs = await queryTabs(queryInfo);
  const [existing] = matchingTabs;
  if (existing) {
    return existing;
  }

  if (!createIfMissing) {
    return undefined;
  }

  return await createTab({ url, active: false });
}

export async function waitForTabComplete(tabId: number): Promise<void> {
  const current = await getTab(tabId);
  if (current?.status === 'complete') {
    return;
  }

  await new Promise<void>((resolve) => {
    function handleUpdated(id: number, changeInfo: chrome.tabs.TabChangeInfo): void {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(handleUpdated);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(handleUpdated);
  });
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      resolve(tabs);
    });
  });
}

function createTab(createProperties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve) => {
    chrome.tabs.create(createProperties, (tab) => {
      resolve(tab);
    });
  });
}

export function getTab(tabId: number): Promise<chrome.tabs.Tab | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }

      resolve(tab ?? undefined);
    });
  });
}

function buildQueryPatterns(url: string): string[] {
  if (typeof url !== 'string' || url.length === 0) {
    return [];
  }

  const tokenMatch = url.match(/0x[a-fA-F0-9]{40}/u);
  if (!tokenMatch) {
    return [url];
  }

  const token = tokenMatch[0];
  const patterns = new Set<string>([
    url,
    `https://www.binance.com/*/alpha/bsc/${token}`,
    `https://www.binance.com/en/alpha/bsc/${token}`,
  ]);

  return Array.from(patterns);
}
