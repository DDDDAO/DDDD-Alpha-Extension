/**
 * 统计卡片组件
 */

import { Card, Statistic } from 'antd';
import type React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  precision?: number;
  suffix?: string;
  prefix?: React.ReactNode;
  loading?: boolean;
  extra?: React.ReactNode;
}

export function StatCard({
  title,
  value,
  precision,
  suffix,
  prefix,
  loading,
  extra,
}: StatCardProps) {
  return (
    <Card size="small" loading={loading}>
      <Statistic
        title={title}
        value={value}
        precision={precision}
        suffix={suffix}
        prefix={prefix}
      />
      {extra}
    </Card>
  );
}
