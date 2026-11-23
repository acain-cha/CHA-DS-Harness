import React, { useState } from 'react';
import analyticsData from '../../design-system/reports/usage-analytics.json';
import './AuditDashboard.css';

interface Issue {
  id: string;
  issue: string;
  where: string;
}

interface ComponentRow {
  name: string;
  category: string;
  status: string;
  figmaNodeId: string;
  codePath: string | null;
  codeInstances: number;
  figmaInstances: number;
  totalInstances: number;
  usageTier: string;
  auditStatus: string;
  healthScore: number;
  openIssues: Issue[];
  lastAudited: string;
}

export const AuditDashboard: React.FC = () => {
  const { summary, components } = analyticsData;
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredComponents = (components as ComponentRow[]).filter((c) => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.category.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (tierFilter !== 'ALL' && c.usageTier !== tierFilter) {
      return false;
    }
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'NEEDS_AUDIT') {
        return !['Healthy', 'Not Implemented'].includes(c.auditStatus);
      }
      if (statusFilter === 'IN_USE') {
        return c.totalInstances > 0;
      }
      if (statusFilter === 'VERIFIED') {
        return c.status === 'verified';
      }
    }
    return true;
  });

  const getTierClass = (tier: string) => {
    switch (tier) {
      case 'High': return 'cha-badge-tier-high';
      case 'Medium': return 'cha-badge-tier-medium';
      case 'Low': return 'cha-badge-tier-low';
      default: return 'cha-badge-tier-zero';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Healthy': return 'cha-badge-status-healthy';
      case 'Unbound Tokens':
      case 'Needs Design Context':
      case 'Action Required':
        return 'cha-badge-status-warn';
      case 'Blocked':
      case 'Stale / Needs Rebuild':
        return 'cha-badge-status-danger';
      default: return 'cha-badge-status-neutral';
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return '#16a34a';
    if (score >= 50) return '#ca8a04';
    return '#dc2626';
  };

  return (
    <div className="cha-audit-dashboard">
      <div className="cha-audit-kpi-grid">
        <div className="cha-kpi-card">
          <div className="cha-kpi-title">Total Library</div>
          <div className="cha-kpi-value">{summary.totalComponents}</div>
          <div className="cha-kpi-sub">{summary.activeComponents} active ({summary.verifiedComponents} verified)</div>
        </div>
        <div className="cha-kpi-card">
          <div className="cha-kpi-title">In Active Use</div>
          <div className="cha-kpi-value">{summary.componentsInUse}</div>
          <div className="cha-kpi-sub">{summary.usageTierCounts.High} High Usage components</div>
        </div>
        <div className="cha-kpi-card">
          <div className="cha-kpi-title">Audit Required</div>
          <div className="cha-kpi-value" style={{ color: summary.componentsNeedingAudit > 0 ? '#dc2626' : '#16a34a' }}>
            {summary.componentsNeedingAudit}
          </div>
          <div className="cha-kpi-sub">Flags, unbound tokens, or stale code</div>
        </div>
        <div className="cha-kpi-card">
          <div className="cha-kpi-title">Last Audit Sync</div>
          <div className="cha-kpi-value" style={{ fontSize: '1.25rem' }}>
            {summary.scannedAt.split('T')[0]}
          </div>
          <div className="cha-kpi-sub">Live MCP & Codebase Scanner</div>
        </div>
      </div>

      <div className="cha-audit-controls">
        <input
          type="text"
          className="cha-search-input"
          placeholder="Filter components by name or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="cha-filter-select"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
        >
          <option value="ALL">All Usage Tiers</option>
          <option value="High">High Usage ({summary.usageTierCounts.High})</option>
          <option value="Medium">Medium Usage ({summary.usageTierCounts.Medium})</option>
          <option value="Low">Low Usage ({summary.usageTierCounts.Low})</option>
          <option value="Zero/Unused">Unused ({summary.usageTierCounts['Zero/Unused']})</option>
        </select>
        <select
          className="cha-filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="ALL">All Audit Statuses</option>
          <option value="NEEDS_AUDIT">⚠️ Needs Audit / Action ({summary.componentsNeedingAudit})</option>
          <option value="IN_USE">In Use Only ({summary.componentsInUse})</option>
          <option value="VERIFIED">Verified Code Only ({summary.verifiedComponents})</option>
        </select>
      </div>

      <div className="cha-audit-table-wrapper">
        <table className="cha-audit-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Category</th>
              <th>Usage Tier</th>
              <th>Instances (Code / Figma)</th>
              <th>Audit Status</th>
              <th>Health Score</th>
              <th>Figma Source</th>
            </tr>
          </thead>
          <tbody>
            {filteredComponents.map((comp) => (
              <tr key={comp.name + comp.figmaNodeId}>
                <td>
                  <strong>{comp.name}</strong>
                  {comp.openIssues.length > 0 && (
                    <div>
                      {comp.openIssues.map((issue) => (
                        <span key={issue.id} className="cha-issue-tag" title={issue.issue}>
                          {issue.issue.length > 60 ? issue.issue.slice(0, 60) + '...' : issue.issue}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{comp.category}</td>
                <td>
                  <span className={`cha-badge ${getTierClass(comp.usageTier)}`}>
                    {comp.usageTier}
                  </span>
                </td>
                <td>
                  <strong>{comp.totalInstances}</strong> ({comp.codeInstances} code / {comp.figmaInstances} Figma)
                </td>
                <td>
                  <span className={`cha-badge ${getStatusClass(comp.auditStatus)}`}>
                    {comp.auditStatus}
                  </span>
                </td>
                <td>
                  <div className="cha-health-bar-container">
                    <div className="cha-health-bar">
                      <div
                        className="cha-health-fill"
                        style={{
                          width: `${comp.healthScore}%`,
                          backgroundColor: getHealthColor(comp.healthScore),
                        }}
                      />
                    </div>
                    <span>{comp.healthScore}%</span>
                  </div>
                </td>
                <td>
                  <a
                    href={`https://www.figma.com/design/nMenOGxGYRL0pyDAc0ZmFF/CHA-Design-System--Copy-?node-id=${comp.figmaNodeId.replace(':', '-')}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0284c7', textDecoration: 'none' }}
                  >
                    {comp.figmaNodeId} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
