// Formatting helpers shared by public dashboard pages and components.
// Keep display logic here so pages do not each define their own number/date/status labels.
import { GoalSummary, ProgressStatus } from './types';

export const CURRENT_YEAR = new Date().getFullYear();

export const formatNumber = (value: number | null | undefined, digits = 1): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return new Intl.NumberFormat('en-RW', {
    maximumFractionDigits: digits
  }).format(value);
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${Math.round(value)}%`;
};

export const goalProgressLabel = (goal: Pick<GoalSummary, 'analyzableCount' | 'targetProgressPercent'>): string => {
  if (goal.analyzableCount === 0) {
    return 'External data to be wired in next step';
  }

  return formatPercent(goal.targetProgressPercent);
};

export const formatDateLabel = (value: string | null): string => {
  if (!value) {
    return 'Not available';
  }

  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return parsed.toLocaleDateString('en-RW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export const parseDate = (value: string): Date | null => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const dmyMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
};

export const toIndicatorSlug = (code: string): string => code.replaceAll('.', '-').toLowerCase();

export const fromIndicatorSlug = (slug: string): string => slug.replaceAll('-', '.');

export const statusClassName = (status: ProgressStatus): string => {
  switch (status) {
    case 'On track':
      return 'bg-emerald-100 text-emerald-800';
    case 'Moderate progress':
      return 'bg-amber-100 text-amber-800';
    case 'Needs attention':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};

export const progressStatusColor = (status: ProgressStatus): string => {
  switch (status) {
    case 'On track':
      return '#16a34a';
    case 'Moderate progress':
      return '#f59e0b';
    case 'Needs attention':
      return '#e11d48';
    default:
      return '#64748b';
  }
};

export const publicStatusLabel = (status: ProgressStatus): string => {
  // Public wording avoids showing "No data" as a failure; these indicators are
  // usually pending validation or publication.
  if (status === 'No data') {
    return 'Under review';
  }

  return status;
};
