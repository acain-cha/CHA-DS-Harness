import React from 'react';
import analyticsData from '../../../design-system/reports/usage-analytics.json';
import './UsageBadge.css';

export interface UsageBadgeProps {
  componentName: string;
}

export const UsageBadge: React.FC<UsageBadgeProps> = ({ componentName }) => {
  const comp = analyticsData.components.find(
    (c) => c.name.toLowerCase() === componentName.toLowerCase() ||
           c.name.toLowerCase().replace(/\s+/g, '') === componentName.toLowerCase()
  );

  if (!comp) return null;

  const getPillClass = (tier: string) => {
    switch (tier) {
      case 'High': return 'cha-usage-high';
      case 'Medium': return 'cha-usage-medium';
      default: return 'cha-usage-low';
    }
  };

  return (
    <div className="cha-usage-meta-card">
      <div className="cha-usage-meta-header">
        <span className={`cha-usage-pill ${getPillClass(comp.usageTier)}`}>
          {comp.usageTier} Usage
        </span>
        <span style={{ fontWeight: 600, color: '#334155' }}>
          Audit Status: <span style={{ color: comp.auditStatus === 'Healthy' ? '#16a34a' : '#ca8a04' }}>{comp.auditStatus}</span>
        </span>
      </div>
      <div className="cha-usage-meta-stats">
        <div className="cha-usage-stat">
          Figma Instances: <strong>{comp.figmaInstances}</strong>
        </div>
        <div className="cha-usage-stat">
          Codebase Instances: <strong>{comp.codeInstances}</strong>
        </div>
        <div className="cha-usage-stat">
          System Health Score: <strong>{comp.healthScore}%</strong>
        </div>
      </div>
    </div>
  );
};
