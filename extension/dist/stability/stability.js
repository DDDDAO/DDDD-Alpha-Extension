"use strict";
/**
 * 稳定性看板 - 主逻辑
 * 从 alpha123.uk 获取币种稳定性数据并展示
 */
const FEED_URL = 'https://alpha123.uk/stability/stability_feed_v2.json';
const UPDATE_INTERVAL = 8000; // 8秒
let updateTimer = null;
/**
 * 解析稳定性状态
 */
function parseStability(st) {
    const [color, status] = st.split(':');
    const labels = {
        stable: '稳定',
        moderate: '一般',
        unstable: '不稳'
    };
    return {
        color,
        label: labels[status] || status
    };
}
/**
 * 计算币种推荐评分
 * 评分规则：
 * - 稳定性：稳定=50分，不稳定=0分
 * - 价差：越低越好 (0-50分)
 * - 4倍天数：5-15天最佳 (0-50分)
 */
function calculateScore(item) {
    const { st, spr, md } = item;
    // 稳定性评分 (0-50)
    let stabilityScore = 0;
    if (st.includes('stable'))
        stabilityScore = 50;
    else
        stabilityScore = 0;
    // 价差评分 (0-50): 价差越小越好
    const spreadScore = Math.max(0, 50 - spr * 10);
    // 4倍天数评分 (0-50): 5-15天为最佳
    let daysScore = 0;
    if (md >= 5 && md <= 15) {
        daysScore = 50;
    }
    else if (md < 5) {
        daysScore = md * 10;
    }
    else {
        daysScore = Math.max(0, 50 - (md - 15) * 3);
    }
    return stabilityScore + spreadScore + daysScore;
}
/**
 * 生成推荐理由
 */
function getReason(score) {
    if (score >= 100)
        return '✨ 稳定性优秀，价差极低，适合稳定套利';
    if (score >= 75)
        return '👍 稳定性良好，价差合理';
    if (score >= 50)
        return '⚠️ 稳定性一般，谨慎操作';
    return '❌ 波动较大，不建议操作';
}
/**
 * 获取稳定性类名
 */
function getStabilityClass(label) {
    if (label === '稳定')
        return 'stability-stable';
    if (label === '一般')
        return 'stability-moderate';
    return 'stability-unstable';
}
/**
 * 获取排名徽章类名
 */
function getRankClass(rank) {
    if (rank === 1)
        return 'rank-1';
    if (rank === 2)
        return 'rank-2';
    if (rank === 3)
        return 'rank-3';
    return 'rank-other';
}
/**
 * 获取稳定性数据
 */
async function fetchStabilityData() {
    try {
        const response = await fetch(FEED_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        return data;
    }
    catch (error) {
        console.error('获取稳定性数据失败:', error);
        throw error;
    }
}
/**
 * 处理数据并计算评分
 */
function processData(data) {
    return data.items
        .map(item => {
        const score = calculateScore(item);
        const { label } = parseStability(item.st);
        return {
            ...item,
            score,
            label,
            reason: getReason(score)
        };
    })
        .sort((a, b) => b.score - a.score);
}
/**
 * 渲染 Top 3 推荐卡片
 */
function renderRecommendations(items) {
    const container = document.getElementById('recommendations');
    if (!container)
        return;
    const top3 = items.slice(0, 3);
    container.innerHTML = top3
        .map((item, index) => `
    <div class="card">
      <div class="card-header">
        <div>
          <div class="card-rank">#${index + 1}</div>
          <div class="card-symbol">${item.n.replace('/USDT', '')}</div>
        </div>
        <div class="card-score">${item.score.toFixed(0)}分</div>
      </div>
      <div class="card-body">
        <div class="card-row">
          <span class="card-label">价格</span>
          <span class="card-value">$${item.p.toFixed(6)}</span>
        </div>
        <div class="card-row">
          <span class="card-label">稳定性</span>
          <span class="stability-badge ${getStabilityClass(item.label)}">${item.label}</span>
        </div>
        <div class="card-row">
          <span class="card-label">价差</span>
          <span class="card-value">${item.spr.toFixed(2)} BP</span>
        </div>
        <div class="card-row">
          <span class="card-label">天数</span>
          <span class="card-value">${item.md} 天</span>
        </div>
        <div class="card-reason">${item.reason}</div>
      </div>
    </div>
  `)
        .join('');
}
/**
 * 渲染完整表格
 */
function renderTable(items) {
    const tbody = document.getElementById('tableBody');
    if (!tbody)
        return;
    tbody.innerHTML = items
        .map((item, index) => `
    <tr>
      <td>
        <span class="rank-badge ${getRankClass(index + 1)}">${index + 1}</span>
      </td>
      <td><strong>${item.n.replace('/USDT', '')}</strong></td>
      <td>$${item.p.toFixed(6)}</td>
      <td>
        <span class="stability-badge ${getStabilityClass(item.label)}">${item.label}</span>
      </td>
      <td>${item.spr.toFixed(2)}</td>
      <td>${item.md}</td>
      <td><strong>${item.score.toFixed(0)}</strong></td>
    </tr>
  `)
        .join('');
}
/**
 * 更新最后更新时间
 */
function updateLastUpdatedTime(timestamp) {
    const element = document.getElementById('lastUpdated');
    if (!element)
        return;
    const date = new Date(timestamp * 1000);
    element.textContent = `最后更新: ${date.toLocaleString('zh-CN')}`;
}
/**
 * 显示加载状态
 */
function showLoading() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const content = document.getElementById('content');
    if (loading)
        loading.style.display = 'block';
    if (error)
        error.style.display = 'none';
    if (content)
        content.style.display = 'none';
}
/**
 * 显示错误状态
 */
function showError(message) {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const content = document.getElementById('content');
    const errorMessage = document.getElementById('errorMessage');
    if (loading)
        loading.style.display = 'none';
    if (error)
        error.style.display = 'block';
    if (content)
        content.style.display = 'none';
    if (errorMessage)
        errorMessage.textContent = message;
}
/**
 * 显示内容
 */
function showContent() {
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const content = document.getElementById('content');
    if (loading)
        loading.style.display = 'none';
    if (error)
        error.style.display = 'none';
    if (content)
        content.style.display = 'block';
}
/**
 * 加载并显示数据
 */
async function loadData() {
    try {
        showLoading();
        const data = await fetchStabilityData();
        if (!data) {
            throw new Error('无法获取数据');
        }
        const items = processData(data);
        renderRecommendations(items);
        renderTable(items);
        updateLastUpdatedTime(data.lastUpdated);
        showContent();
    }
    catch (error) {
        console.error('加载数据失败:', error);
        showError(`加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
}
/**
 * 开始自动更新
 */
function startAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
    }
    updateTimer = window.setInterval(() => {
        loadData();
    }, UPDATE_INTERVAL);
}
/**
 * 停止自动更新
 */
function stopAutoUpdate() {
    if (updateTimer) {
        clearInterval(updateTimer);
        updateTimer = null;
    }
}
/**
 * 初始化
 */
async function init() {
    // 绑定按钮事件
    const refreshBtn = document.getElementById('refreshBtn');
    const retryBtn = document.getElementById('retryBtn');
    const backBtn = document.getElementById('backBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadData();
        });
    }
    if (retryBtn) {
        retryBtn.addEventListener('click', () => {
            loadData();
        });
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'popup.html';
        });
    }
    // 初始加载
    await loadData();
    // 开始自动更新
    startAutoUpdate();
}
// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}
// 页面卸载时停止更新
window.addEventListener('beforeunload', () => {
    stopAutoUpdate();
});
