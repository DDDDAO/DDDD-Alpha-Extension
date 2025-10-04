/**
 * 稳定性数据获取器测试脚本
 * 使用方式: node test-fetcher.js
 */

const FEED_URL = 'https://alpha123.uk/stability/stability_feed_v2.json';

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

function calculateScore(item) {
  const { st, spr, md } = item;

  let stabilityScore = 0;
  if (st.includes('stable')) stabilityScore = 100;
  else if (st.includes('moderate')) stabilityScore = 50;
  else stabilityScore = 0;

  const spreadScore = Math.max(0, 50 - spr * 10);

  let daysScore = 0;
  if (md >= 5 && md <= 15) {
    daysScore = 50;
  } else if (md < 5) {
    daysScore = md * 10;
  } else {
    daysScore = Math.max(0, 50 - (md - 15) * 3);
  }

  return stabilityScore + spreadScore + daysScore;
}

function getReason(score) {
  if (score >= 150) return '✨ 稳定性优秀，价差极低，适合稳定套利';
  if (score >= 100) return '👍 稳定性良好，价差合理';
  if (score >= 50) return '⚠️  稳定性一般，谨慎操作';
  return '❌ 波动较大，不建议操作';
}

async function fetchStabilityData() {
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 获取稳定性数据失败:', error.message);
    return null;
  }
}

async function getRecommendations(topN = 3) {
  console.log('🔍 正在获取稳定性数据...\n');

  const data = await fetchStabilityData();
  if (!data) {
    console.log('❌ 无法获取数据，测试失败\n');
    return [];
  }

  console.log(`✅ 数据获取成功！最后更新时间: ${new Date(data.lastUpdated * 1000).toLocaleString('zh-CN')}\n`);
  console.log(`📊 共有 ${data.items.length} 个币种\n`);

  const recommendations = data.items
    .map(item => {
      const score = calculateScore(item);
      const { label } = parseStability(item.st);

      return {
        symbol: item.n.replace('/USDT', ''),
        price: item.p,
        stability: label,
        spread: item.spr,
        days: item.md,
        score,
        reason: getReason(score)
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return recommendations;
}

async function displayRecommendations() {
  const recommendations = await getRecommendations(3);

  if (recommendations.length === 0) {
    console.log('❌ 没有推荐数据\n');
    return;
  }

  console.log('🏆 Top 3 稳定币种推荐\n');
  console.log('='.repeat(80));

  recommendations.forEach((rec, index) => {
    console.log(`\n#${index + 1} ${rec.symbol}`);
    console.log(`   综合评分: ${rec.score.toFixed(0)} 分`);
    console.log(`   当前价格: $${rec.price.toFixed(6)}`);
    console.log(`   稳定性:   ${rec.stability}`);
    console.log(`   价差基点: ${rec.spread.toFixed(2)}`);
    console.log(`   4倍天数:  ${rec.days} 天`);
    console.log(`   推荐理由: ${rec.reason}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ 测试完成！功能运行正常。\n');
}

// 运行测试
displayRecommendations();
