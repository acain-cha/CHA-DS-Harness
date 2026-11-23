#!/usr/bin/env node
/**
 * Component Usage & Design Audit Analytics Scanner
 *
 * Scans codebase JSX/TSX and Figma metadata to compute:
 * - Codebase instance counts (imports, JSX tags)
 * - Figma instance counts (from metadata XML dumps)
 * - Usage Tier (High, Medium, Low, Unused)
 * - Design Audit issues (unbound tokens, raw CSS values, missing context, harness log flags)
 *
 * Output: design-system/reports/usage-analytics.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (...p) => path.join(ROOT, ...p);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// 1. Load manifest and harness log
const manifest = readJson(at('design-system/manifest.json')) || { components: [] };
const harnessLogFile = at('design-system/reports/harness-log.jsonl');
const harnessLogItems = [];
if (fs.existsSync(harnessLogFile)) {
  const lines = fs.readFileSync(harnessLogFile, 'utf8').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      harnessLogItems.push(JSON.parse(line));
    } catch {}
  }
}

// Map open issues by component name (normalized)
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/s$/, '');
const issuesByComp = new Map();
for (const item of harnessLogItems) {
  if (item.status === 'open' || item.status === 'unresolved') {
    const key = norm(item.component);
    if (!issuesByComp.has(key)) issuesByComp.set(key, []);
    issuesByComp.get(key).push(item);
  }
}

// 2. Scan Codebase for Component Usage
function getFilesRecursively(dir, exts) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.storybook'].includes(file)) {
        results = results.concat(getFilesRecursively(filePath, exts));
      }
    } else if (exts.some(ext => file.endsWith(ext))) {
      results.push(filePath);
    }
  }
  return results;
}

const codeFiles = getFilesRecursively(at('src'), ['.tsx', '.ts', '.jsx', '.js']);
// Separate component definitions from consumers
const consumerFiles = codeFiles.filter(f => !f.match(/components\/[^/]+\/[^/]+\.(tsx|ts|jsx|js)$/));

const codeUsage = new Map();
for (const comp of manifest.components) {
  codeUsage.set(comp.name, { instances: 0, files: [] });
}

// Common component aliases in code
const nameAliases = {
  'Text Links': 'TextLink',
  'Input Field': 'InputField',
  'Radio Buttons': 'RadioButton',
  'Radio Button': 'RadioButton',
  'Checkboxes': 'Checkbox',
};

for (const filePath of consumerFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');

  for (const comp of manifest.components) {
    const primaryName = comp.name;
    const alias = nameAliases[primaryName] || primaryName.replace(/\s+/g, '');
    const cleanName = comp.name.replace(/s$/, '');

    // Pattern to match JSX tags: <Button or <InputField
    const regex = new RegExp('<(' + [primaryName, alias, cleanName].filter(Boolean).join('|') + ')\\b', 'g');
    const matches = content.match(regex);
    if (matches && matches.length > 0) {
      const entry = codeUsage.get(primaryName) || { instances: 0, files: [] };
      entry.instances += matches.length;
      entry.files.push({ file: relPath, count: matches.length });
      codeUsage.set(primaryName, entry);
    }
  }
}

// 3. Scan Figma Metadata for Instances
const figmaUsage = new Map();
const metadataFile = at('design-system/figma/metadata/components.xml');
if (fs.existsSync(metadataFile)) {
  const xmlContent = fs.readFileSync(metadataFile, 'utf8');
  const instanceRegex = /<instance\b[^>]*name="([^"]+)"/g;
  let match;
  while ((match = instanceRegex.exec(xmlContent)) !== null) {
    const rawName = match[1];
    const n = norm(rawName);
    figmaUsage.set(n, (figmaUsage.get(n) || 0) + 1);
  }
}

// 4. Assemble Comprehensive Audit and Analytics Data
const componentsReport = manifest.components.map(comp => {
  const n = norm(comp.name);
  const codeStats = codeUsage.get(comp.name) || { instances: 0, files: [] };
  
  // Calculate Figma instances (checking direct name and sub-string matches)
  let figmaCount = figmaUsage.get(n) || 0;
  for (const [fName, count] of figmaUsage.entries()) {
    if (fName !== n && (fName.includes(n) || n.includes(fName))) {
      figmaCount += count;
    }
  }

  const issues = issuesByComp.get(n) || [];
  const openIssueCount = issues.length;

  // Determine Usage Tier
  const totalOccurrences = codeStats.instances + figmaCount;
  let usageTier = 'Zero/Unused';
  if (totalOccurrences >= 15) usageTier = 'High';
  else if (totalOccurrences >= 5) usageTier = 'Medium';
  else if (totalOccurrences >= 1) usageTier = 'Low';

  // Determine Audit Status
  let auditStatus = 'Healthy';
  if (comp.status === 'blocked') {
    auditStatus = 'Blocked';
  } else if (comp.status === 'stale') {
    auditStatus = 'Stale / Needs Rebuild';
  } else if (openIssueCount > 0) {
    if (issues.some(i => i.type === 'missing-context' || (i.issue && i.issue.includes('design context')))) {
      auditStatus = 'Needs Design Context';
    } else if (issues.some(i => i.type === 'raw-value' || (i.issue && i.issue.includes('Raw value')))) {
      auditStatus = 'Unbound Tokens';
    } else {
      auditStatus = 'Action Required';
    }
  } else if (comp.status === 'extracted') {
    auditStatus = 'Not Implemented';
  }

  // Calculate Health Score (0 - 100)
  let healthScore = 100;
  if (comp.status === 'extracted') healthScore = 20;
  else if (comp.status === 'blocked') healthScore = 10;
  else if (comp.status === 'stale') healthScore = 40;
  else if (comp.status === 'verified') healthScore = 80;

  // Deduct for issues
  healthScore = Math.max(0, healthScore - (openIssueCount * 10));
  if (codeStats.instances > 0) healthScore = Math.min(100, healthScore + 10);

  return {
    name: comp.name,
    category: comp.category,
    status: comp.status,
    figmaNodeId: comp.figmaNodeId,
    codePath: comp.codePath || null,
    codeInstances: codeStats.instances,
    usedInFiles: codeStats.files,
    figmaInstances: figmaCount,
    totalInstances: totalOccurrences,
    usageTier,
    auditStatus,
    healthScore,
    openIssues: issues.map(i => ({
      id: i.id,
      issue: i.issue,
      where: i.where || '',
    })),
    lastAudited: new Date().toISOString().split('T')[0],
  };
});

// Sort components: Most used first, then status
componentsReport.sort((a, b) => b.totalInstances - a.totalInstances || b.healthScore - a.healthScore);

const summary = {
  scannedAt: new Date().toISOString(),
  totalComponents: componentsReport.length,
  activeComponents: componentsReport.filter(c => c.status !== 'superseded').length,
  verifiedComponents: componentsReport.filter(c => c.status === 'verified').length,
  extractedComponents: componentsReport.filter(c => c.status === 'extracted').length,
  supersededComponents: componentsReport.filter(c => c.status === 'superseded').length,
  blockedComponents: componentsReport.filter(c => c.status === 'blocked').length,
  componentsInUse: componentsReport.filter(c => c.totalInstances > 0).length,
  componentsNeedingAudit: componentsReport.filter(c => !['Healthy', 'Not Implemented'].includes(c.auditStatus)).length,
  usageTierCounts: {
    High: componentsReport.filter(c => c.usageTier === 'High').length,
    Medium: componentsReport.filter(c => c.usageTier === 'Medium').length,
    Low: componentsReport.filter(c => c.usageTier === 'Low').length,
    'Zero/Unused': componentsReport.filter(c => c.usageTier === 'Zero/Unused').length,
  },
};

const outputData = {
  summary,
  components: componentsReport,
};

const outputPath = at('design-system/reports/usage-analytics.json');
writeJson(outputPath, outputData);
console.log(`✓ Usage analytics computed for ${componentsReport.length} components.`);
console.log(`  - Total In Use (Code/Figma): ${summary.componentsInUse}`);
console.log(`  - High Usage: ${summary.usageTierCounts.High}`);
console.log(`  - Components Needing Audit: ${summary.componentsNeedingAudit}`);
console.log(`  - Saved to ${path.relative(ROOT, outputPath)}`);
