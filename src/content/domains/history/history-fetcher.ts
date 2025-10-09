/**
 * 历史记录获取器
 */

export class HistoryFetcher {
  async fetchPage(
    url: string,
    csrfToken: string,
  ): Promise<{ success: boolean; data?: unknown; status?: number }> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          clienttype: 'web',
          csrftoken: csrfToken,
          Accept: 'application/json, text/plain, */*',
        },
      });

      const status = response.status;
      let data: unknown = null;

      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        // JSON 解析失败
      }

      if (!response.ok) {
        return { success: false, status, data };
      }

      return { success: true, status, data };
    } catch {
      return { success: false };
    }
  }

  async fetchAllPages(
    urlBuilder: (page: number) => string,
    csrfToken: string,
    maxPages = 10,
  ): Promise<unknown[]> {
    const allResponses: unknown[] = [];
    let currentPage = 1;

    while (currentPage <= maxPages) {
      const targetUrl = urlBuilder(currentPage);
      const response = await this.fetchPage(targetUrl, csrfToken);

      if (!response.success || !response.data) {
        if (currentPage === 1) return [];
        break;
      }

      allResponses.push(response.data);

      type ResponseData = { data?: unknown[] };
      const data = response.data as ResponseData;
      if (data?.data && Array.isArray(data.data)) {
        const itemCount = data.data.length;
        if (itemCount < 100) break;
      } else {
        break;
      }

      currentPage++;
    }

    return allResponses;
  }
}
