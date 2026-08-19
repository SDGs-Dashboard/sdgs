// Workbook update helpers for approved SDG data exports.
// These functions operate on generated approved copies, never on the original workbook.
import fs from 'fs';

import XLSX from 'xlsx';

import { MAIN_WORKBOOK_PATH, PUBLIC_APPROVED_WORKBOOK_PATH } from './constants';
import { IndicatorCatalogRecord } from './nisrCatalog';
import { ApprovedSdgDataRecord } from './types';

const YEAR_COLUMNS = Array.from({ length: 25 }, (_, index) => String(2000 + index));

export interface WorkbookConflict {
  rowIndex: number;
  year: string;
  previousValue: number | null;
  newValue: number;
}

const ensureWorkbook = (): void => {
  if (fs.existsSync(PUBLIC_APPROVED_WORKBOOK_PATH)) {
    return;
  }

  if (!fs.existsSync(MAIN_WORKBOOK_PATH)) {
    throw new Error('Approved workbook does not exist and no fallback source workbook was found.');
  }

  fs.mkdirSync(require('path').dirname(PUBLIC_APPROVED_WORKBOOK_PATH), { recursive: true });
  fs.copyFileSync(MAIN_WORKBOOK_PATH, PUBLIC_APPROVED_WORKBOOK_PATH);
};

const resetWorkbookToBase = (): void => {
  if (!fs.existsSync(MAIN_WORKBOOK_PATH)) {
    throw new Error('Base public workbook was not found.');
  }

  fs.mkdirSync(require('path').dirname(PUBLIC_APPROVED_WORKBOOK_PATH), { recursive: true });
  fs.copyFileSync(MAIN_WORKBOOK_PATH, PUBLIC_APPROVED_WORKBOOK_PATH);
};

const emptyWorkbookRow = (): Record<string, string | number> => {
  const row: Record<string, string | number> = {
    Indicator: '',
    Series: '',
    Series_Code: '',
    'Composite ': '_T',
    Unit_Code: '',
    'Occupation ': '',
    Occupation_Code: '_T',
    Ref_Area: 'RW',
    Province: '',
    District: '',
    Urbanization: '',
    Urbanization_Code: '_T',
    'Education ': '',
    Education_Code: '_T',
    'Data Source': '',
    Description: '',
    Seats: '',
    Age_Code: '_T',
    Age: '',
    Sex_Code: 'NONE',
    Sex: 'None'
  };

  for (const year of YEAR_COLUMNS) {
    row[year] = '';
  }

  return row;
};

const matchWorkbookRow = (row: Record<string, unknown>, approved: ApprovedSdgDataRecord): boolean =>
  String(row.Indicator ?? '').trim() === approved.indicator_code &&
  String(row.Series_Code ?? '').trim() === approved.series_code &&
  String(row.Province ?? '').trim() === approved.province &&
  String(row.District ?? '').trim() === approved.district &&
  String(row.Sex ?? '').trim() === approved.sex &&
  String(row.Age ?? '').trim() === approved.age_group;

export const appendOrUpdateWorkbookRecord = (
  approved: ApprovedSdgDataRecord,
  indicator: IndicatorCatalogRecord | undefined,
  confirmOverwrite: boolean
): WorkbookConflict | null => {
  ensureWorkbook();

  const workbook = XLSX.readFile(PUBLIC_APPROVED_WORKBOOK_PATH);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });

  const year = approved.time_period;
  if (!YEAR_COLUMNS.includes(year)) {
    throw new Error(`Unsupported time period for workbook export: ${year}`);
  }

  const existingIndex = rows.findIndex((row) => matchWorkbookRow(row, approved));
  if (existingIndex >= 0) {
    const existingRow = rows[existingIndex];
    const currentValue = existingRow[year];
    const currentNumeric =
      currentValue === '' || currentValue === null || currentValue === undefined ? null : Number(currentValue);

    if (currentNumeric !== null && Number.isFinite(currentNumeric) && currentNumeric !== approved.value && !confirmOverwrite) {
      return {
        rowIndex: existingIndex,
        year,
        previousValue: currentNumeric,
        newValue: approved.value
      };
    }

    existingRow[year] = approved.value;
    existingRow['Data Source'] = approved.data_source;
    workbook.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows);
    XLSX.writeFile(workbook, PUBLIC_APPROVED_WORKBOOK_PATH);
    return null;
  }

  const nextRow = emptyWorkbookRow();
  nextRow.Indicator = approved.indicator_code;
  nextRow.Series = approved.series || indicator?.series || approved.indicator || approved.indicator_code;
  nextRow.Series_Code = approved.series_code;
  nextRow.Unit_Code = approved.unit || indicator?.unit || '';
  nextRow.Province = approved.province;
  nextRow.District = approved.district || approved.location;
  nextRow['Data Source'] = approved.data_source;
  nextRow.Description = indicator?.indicator_definition || approved.notes || approved.indicator || '';
  nextRow.Age = approved.age_group;
  nextRow.Age_Code = approved.age_group ? approved.age_group.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_') : '_T';
  nextRow.Sex = approved.sex || 'None';
  nextRow.Sex_Code = approved.sex ? approved.sex.slice(0, 1).toUpperCase() : 'NONE';
  nextRow[year] = approved.value;
  rows.push(nextRow);

  workbook.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows);
  XLSX.writeFile(workbook, PUBLIC_APPROVED_WORKBOOK_PATH);
  return null;
};

export const rebuildWorkbookFromApprovedRecords = (
  approvedRecords: ApprovedSdgDataRecord[],
  indicatorLookup: Map<string, IndicatorCatalogRecord>
): void => {
  resetWorkbookToBase();

  const sortedRecords = approvedRecords
    .slice()
    .sort((left, right) => left.approved_at.localeCompare(right.approved_at));

  for (const record of sortedRecords) {
    appendOrUpdateWorkbookRecord(record, indicatorLookup.get(record.indicator_code), true);
  }
};
