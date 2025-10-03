export async function locateOrCreateTab({ url, createIfMissing = true, }) {
    const patterns = buildQueryPatterns(url);
    const queryInfo = patterns.length > 0 ? { url: patterns } : { url };
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
export async function waitForTabComplete(tabId) {
    const current = await getTab(tabId);
    if (current?.status === 'complete') {
        return;
    }
    await new Promise((resolve) => {
        function handleUpdated(id, changeInfo) {
            if (id === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(handleUpdated);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(handleUpdated);
    });
}
function queryTabs(queryInfo) {
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
function createTab(createProperties) {
    return new Promise((resolve) => {
        chrome.tabs.create(createProperties, (tab) => {
            resolve(tab);
        });
    });
}
export function getTab(tabId) {
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
function buildQueryPatterns(url) {
    if (typeof url !== 'string' || url.length === 0) {
        return [];
    }
    const tokenMatch = url.match(/0x[a-fA-F0-9]{40}/u);
    if (!tokenMatch) {
        return [url];
    }
    const token = tokenMatch[0];
    const patterns = new Set([
        url,
        `https://www.binance.com/*/alpha/bsc/${token}`,
        `https://www.binance.com/en/alpha/bsc/${token}`,
    ]);
    return Array.from(patterns);
}
