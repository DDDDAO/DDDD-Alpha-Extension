/**
 * 状态徽章组件
 */

import { Tag } from 'antd';
import type React from 'react';

interface StatusBadgeProps {
  status: 'running' | 'enabled' | 'disabled' | 'error';
  text: string;
  icon?: React.ReactNode;
}

export function StatusBadge({ status, text, icon }: StatusBadgeProps) {
  const colorMap = {
    running: 'processing',
    enabled: 'success',
    disabled: 'default',
    error: 'error',
  } as const;

  return (
    <Tag color={colorMap[status]} icon={icon}>
      {text}
    </Tag>
  );
}
