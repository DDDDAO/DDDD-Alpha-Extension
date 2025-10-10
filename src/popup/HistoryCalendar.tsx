import { CalendarOutlined, SaveOutlined } from '@ant-design/icons';
import { Button, Card, message, Popover, Space, Typography } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyHistoryData, HistoryDataStore } from '../lib/storage';
import { getHistoryData, saveHistoryData } from '../lib/storage';

const { Text } = Typography;

interface HistoryCalendarProps {
  currentDayData?: DailyHistoryData;
}

export function HistoryCalendar({ currentDayData }: HistoryCalendarProps) {
  const { t } = useTranslation();
  const [historyData, setHistoryData] = useState<HistoryDataStore>({});
  const [saving, setSaving] = useState(false);

  const loadHistoryData = useCallback(async () => {
    const data = await getHistoryData();
    setHistoryData(data);
  }, []);

  useEffect(() => {
    void loadHistoryData();
  }, [loadHistoryData]);

  // 获取最近15天的日期
  function getLast15Days(): string[] {
    const days: string[] = [];
    const today = new Date();
    for (let i = 14; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      days.push(date.toISOString().slice(0, 10));
    }
    return days;
  }

  // 根据损耗率获取颜色
  function getCostRatioColor(ratio: number | undefined): string {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
      return '#f0f0f0';
    }

    // 绿色（<0.5‱）
    if (ratio < 0.00005) {
      return '#52c41a';
    }
    // 黄色（0.5‱-1‱）
    if (ratio < 0.0001) {
      return '#faad14';
    }
    // 红色（>1‱）
    return '#f5222d';
  }

  // 格式化数字
  function formatNumber(value: number | undefined): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // 格式化损耗率
  function formatCostRatio(ratio: number | undefined): string {
    if (typeof ratio === 'number' && Number.isFinite(ratio)) {
      return `${(ratio * 10000).toFixed(2)}‱`;
    }
    return '—';
  }

  // 渲染单个日期格子
  function renderDayCell(date: string) {
    const data = historyData[date];
    const dateObj = new Date(date);
    const dayOfMonth = dateObj.getDate();
    const backgroundColor = data ? getCostRatioColor(data.costRatio) : '#f0f0f0';
    const hasData = Boolean(data);

    // 根据语言环境格式化日期显示
    const formatDayLabel = (): string => {
      const lang = t('app.title') === 'DDDD Alpha Tool' ? 'en' : 'zh';
      if (lang === 'en') {
        // 英文: 月份简写 + 日期 (如 "Sep 9")
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      // 中文: 日期 + "日" (如 "9日")
      return `${dayOfMonth}日`;
    };

    // 格式化损耗金额（简化显示）
    const formatCostDisplay = (cost: number | undefined): string => {
      if (typeof cost !== 'number' || Number.isNaN(cost)) {
        return '—';
      }
      if (cost >= 1000) {
        return `${(cost / 1000).toFixed(1)}k`;
      }
      if (cost >= 100) {
        return cost.toFixed(0);
      }
      if (cost >= 10) {
        return cost.toFixed(1);
      }
      return cost.toFixed(2);
    };

    const popoverContent = data ? (
      <div
        style={{
          minWidth: 220,
          padding: 4,
        }}
      >
        <div
          style={{
            marginBottom: 12,
            paddingBottom: 10,
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <CalendarOutlined style={{ color: '#597ef7', fontSize: 14 }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>{date}</span>
        </div>
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(245, 34, 45, 0.04)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('history.totalCost')}
            </Text>
            <Text strong style={{ fontSize: 13 }}>
              {formatNumber(data.totalCost)}
            </Text>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(89, 126, 247, 0.04)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('history.costRatio')}
            </Text>
            <Text
              strong
              style={{
                fontSize: 13,
                color: getCostRatioColor(data.costRatio),
                fontWeight: 600,
              }}
            >
              {formatCostRatio(data.costRatio)}
            </Text>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('history.buyVolume')}
            </Text>
            <Text strong style={{ fontSize: 13 }}>
              {formatNumber(data.buyVolume)}
            </Text>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('history.alphaPoints')}
            </Text>
            <Text strong style={{ fontSize: 13 }}>
              {data.alphaPoints ?? '—'}
            </Text>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.02)',
            }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t('history.tradeCount')}
            </Text>
            <Text strong style={{ fontSize: 13 }}>
              {data.tradeCount ?? '—'}
            </Text>
          </div>
          {data.tokenSymbol && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 8px',
                borderRadius: 6,
                background: 'rgba(0, 0, 0, 0.02)',
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('history.tokenSymbol')}
              </Text>
              <Text strong style={{ fontSize: 13 }}>
                {data.tokenSymbol}
              </Text>
            </div>
          )}
        </Space>
      </div>
    ) : (
      <div style={{ padding: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('history.noData')}
        </Text>
      </div>
    );

    const cellClassName = `history-cell-${hasData ? 'data' : 'empty'}`;

    return (
      <Popover content={popoverContent} title={null} key={date} trigger="hover">
        <button
          type="button"
          className={cellClassName}
          disabled={!hasData}
          style={{
            width: 62,
            height: 54,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor,
            borderRadius: 8,
            cursor: hasData ? 'pointer' : 'default',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            gap: 3,
            boxShadow: hasData ? '0 2px 6px rgba(0, 0, 0, 0.08)' : '0 1px 3px rgba(0, 0, 0, 0.04)',
            border: hasData
              ? '1px solid rgba(255, 255, 255, 0.3)'
              : '1px solid rgba(0, 0, 0, 0.06)',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            if (hasData) {
              e.currentTarget.style.transform = 'translateY(-3px) scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.15)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = hasData
              ? '0 2px 6px rgba(0, 0, 0, 0.08)'
              : '0 1px 3px rgba(0, 0, 0, 0.04)';
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: hasData ? 'rgba(255, 255, 255, 0.9)' : '#999',
              fontWeight: hasData ? 500 : 400,
              letterSpacing: '0.3px',
            }}
          >
            {formatDayLabel()}
          </div>
          <div
            style={{
              fontSize: hasData ? 13 : 11,
              fontWeight: hasData ? 700 : 400,
              color: hasData ? '#fff' : '#999',
              textShadow: hasData ? '0 1px 2px rgba(0, 0, 0, 0.15)' : 'none',
            }}
          >
            {hasData ? formatCostDisplay(data.totalCost) : '—'}
          </div>
        </button>
      </Popover>
    );
  }

  const handleManualSave = useCallback(async () => {
    if (!currentDayData) {
      void message.warning(t('history.noDataToSave'));
      return;
    }

    setSaving(true);
    try {
      await saveHistoryData(currentDayData);
      void message.success(t('history.saveSuccess'));
      // 重新加载数据
      await loadHistoryData();
    } catch (error) {
      console.error('Failed to save history data:', error);
      void message.error(t('history.saveFailed'));
    } finally {
      setSaving(false);
    }
  }, [currentDayData, loadHistoryData, t]);

  const days = getLast15Days();

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={10}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #597ef7 0%, #2f54eb 100%)',
                boxShadow: '0 2px 8px rgba(47, 84, 235, 0.2)',
              }}
            >
              <CalendarOutlined style={{ color: '#ffffff', fontSize: 16 }} />
            </div>
            <span style={{ fontWeight: 600, fontSize: 16 }}>{t('history.title')}</span>
          </Space>
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={handleManualSave}
            loading={saving}
            disabled={!currentDayData}
            style={{
              borderRadius: 8,
              fontWeight: 500,
              boxShadow: !currentDayData ? 'none' : '0 2px 6px rgba(24, 144, 255, 0.2)',
            }}
          >
            {t('history.saveButton')}
          </Button>
        </div>
      }
      bordered={false}
      size="small"
      style={{
        marginBottom: 16,
        borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)',
        background: 'linear-gradient(135deg, #ffffff 0%, #f0f5ff 100%)',
        border: 'none',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      styles={{ body: { padding: 16 } }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow =
          '0 4px 20px rgba(47, 84, 235, 0.08), 0 0 0 1px rgba(47, 84, 235, 0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow =
          '0 2px 12px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0, 0, 0, 0.02)';
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          justifyContent: 'flex-start',
          padding: 4,
          borderRadius: 8,
          background: 'rgba(89, 126, 247, 0.02)',
        }}
      >
        {days.map((date) => renderDayCell(date))}
      </div>
      <div
        style={{
          marginTop: 16,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'rgba(89, 126, 247, 0.04)',
          border: '1px solid rgba(89, 126, 247, 0.1)',
        }}
      >
        <Space size={16}>
          <Space size={6}>
            <div
              style={{
                width: 14,
                height: 14,
                backgroundColor: '#52c41a',
                borderRadius: 3,
                boxShadow: '0 1px 3px rgba(82, 196, 26, 0.3)',
              }}
            />
            <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>&lt; 0.5‱</span>
          </Space>
          <Space size={6}>
            <div
              style={{
                width: 14,
                height: 14,
                backgroundColor: '#faad14',
                borderRadius: 3,
                boxShadow: '0 1px 3px rgba(250, 173, 20, 0.3)',
              }}
            />
            <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>0.5‱ - 1‱</span>
          </Space>
          <Space size={6}>
            <div
              style={{
                width: 14,
                height: 14,
                backgroundColor: '#f5222d',
                borderRadius: 3,
                boxShadow: '0 1px 3px rgba(245, 34, 45, 0.3)',
              }}
            />
            <span style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>&gt; 1‱</span>
          </Space>
        </Space>
      </div>
    </Card>
  );
}
