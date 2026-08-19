// Admin automation control center.
// Staff start here to import the mapping workbook, upload reports, view report
// status, and export approved dashboard data.
import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import { NisrAdminLayout } from '../../../components/admin/NisrAdminLayout';
import { StatusBadge } from '../../../components/admin/StatusBadge';
import { AutomationReport, AutomationSummary, nisrAutomationApi } from '../../../lib/nisrAutomationApi';

interface UploadFormState {
  reportName: string;
  reportFamily: string;
  publicationYear: string;
}

const INITIAL_FORM: UploadFormState = {
  reportName: '',
  reportFamily: '',
  publicationYear: ''
};

export default function NisrReportsLibraryPage(): JSX.Element {
  const [summary, setSummary] = useState<AutomationSummary | null>(null);
  const [reports, setReports] = useState<AutomationReport[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [form, setForm] = useState<UploadFormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async (): Promise<void> => {
    const [summaryPayload, reportsPayload] = await Promise.all([nisrAutomationApi.getSummary(), nisrAutomationApi.getReports()]);
    setSummary(summaryPayload);
    setReports(reportsPayload);
  };

  useEffect(() => {
    void loadData().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load admin data.'));
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    if (file && !form.reportName) {
      setForm((current) => ({ ...current, reportName: file.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedFile) {
      setError('Choose a PDF or Excel report before uploading.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('report_name', form.reportName || selectedFile.name.replace(/\.[^.]+$/, ''));
      formData.append('report_family', form.reportFamily);
      formData.append('publication_year', form.publicationYear);
      formData.append('owner', 'admin');
      await nisrAutomationApi.uploadReport(formData);
      setSelectedFile(null);
      setForm(INITIAL_FORM);
      setMessage('Report uploaded into the admin automation queue.');
      await loadData();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const initializeControlWorkbook = async (): Promise<void> => {
    setInitializing(true);
    setError(null);
    setMessage(null);
    try {
      await nisrAutomationApi.importControlWorkbook();
      setMessage('Control workbook imported into the automation database.');
      await loadData();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.');
    } finally {
      setInitializing(false);
    }
  };

  const deleteReport = async (report: AutomationReport): Promise<void> => {
    const confirmed = window.confirm(
      `Delete "${report.report_name}"? This removes the uploaded file and workflow artifacts for this report.`
    );
    if (!confirmed) {
      return;
    }

    setDeletingReportId(report.report_id);
    setError(null);
    setMessage(null);
    try {
      const response = await nisrAutomationApi.deleteReport(report.report_id);
      setMessage(response.message);
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Delete failed.');
    } finally {
      setDeletingReportId(null);
    }
  };

  return (
    <NisrAdminLayout
      title="NISR Automation Dashboard"
      description="Use this admin dashboard to manage the full NISR SDG update workflow: initialize the control workbook, upload reports, run extraction, review proposals, approve trusted values, and export the refreshed dashboard workbook."
    >
      <div className="space-y-6">
        <div className="panel p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-rwBlue">Dashboard Overview</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">NISR SDG automation control center</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Start here, then move through upload, extraction, review, approval, and export inside the dashboard admin area.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/nisr-automation/extract" className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white">
                Go to extraction
              </Link>
              <Link href="/admin/nisr-automation/review" className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white">
                Review proposals
              </Link>
              <Link href="/admin/nisr-automation/results" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
                View extraction results
              </Link>
              <Link href="/admin/nisr-automation/approved" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
                View approved data
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">NISR indicators</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{summary?.nisr_indicators ?? '-'}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Waiting review</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{summary?.proposed_updates_waiting_review ?? '-'}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approved updates</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{summary?.approved_updates ?? '-'}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports processed</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{summary?.reports_processed ?? '-'}</p>
          </div>
          <div className="panel p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Success rate</p>
            <p className="mt-2 text-3xl font-semibold text-slate-900">{summary ? `${summary.extraction_success_rate}%` : '-'}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void initializeControlWorkbook()}
            disabled={initializing}
            className="rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {initializing ? 'Initializing...' : 'Initialize from control workbook'}
          </button>
          <a href={nisrAutomationApi.exportUrl('dashboard')} target="_blank" rel="noreferrer" className="rounded-full bg-rwGreen px-4 py-2 text-sm font-semibold text-white">
            Export updated dashboard
          </a>
          <a href={nisrAutomationApi.exportUrl('proposed-updates')} target="_blank" rel="noreferrer" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
            Export proposed updates
          </a>
          <a href={nisrAutomationApi.exportUrl('approved-updates')} target="_blank" rel="noreferrer" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
            Export approved updates
          </a>
          <a href={nisrAutomationApi.exportUrl('audit-log')} target="_blank" rel="noreferrer" className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white">
            Export audit log
          </a>
        </div>

        {message ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">{message}</div> : null}
        {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

        <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <form className="panel p-5" onSubmit={onSubmit}>
            <h2 className="text-lg font-semibold text-slate-900">Upload report</h2>
            <div className="mt-4 space-y-4 text-sm">
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">NISR file</span>
                <input type="file" accept=".pdf,.xls,.xlsx,.csv" onChange={onFileChange} className="w-full text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">Report name</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={form.reportName}
                  onChange={(event) => setForm((current) => ({ ...current, reportName: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">Report family</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="EICV, DHS, LFS..."
                  value={form.reportFamily}
                  onChange={(event) => setForm((current) => ({ ...current, reportFamily: event.target.value }))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-700">Publication year</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={form.publicationYear}
                  onChange={(event) => setForm((current) => ({ ...current, publicationYear: event.target.value }))}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-5 rounded-full bg-rwBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Uploading...' : 'Upload report'}
            </button>
          </form>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Report Register</h2>
                <p className="text-sm text-slate-500">{reports.length} reports tracked in the automation database</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Report name</th>
                    <th className="px-4 py-3">Family</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Uploaded</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Summary</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => (
                    <tr key={report.report_id} className="border-t border-slate-100 text-slate-700">
                      <td className="px-4 py-3 font-medium text-slate-900">{report.report_name}</td>
                      <td className="px-4 py-3">{report.report_family || '-'}</td>
                      <td className="px-4 py-3 uppercase">{report.report_type}</td>
                      <td className="px-4 py-3">{report.publication_year ?? '-'}</td>
                      <td className="px-4 py-3">{new Date(report.upload_date).toLocaleString('en-RW')}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={report.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{report.extraction_summary || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void deleteReport(report)}
                          disabled={deletingReportId === report.report_id}
                          className="rounded-full border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingReportId === report.report_id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                    {!reports.length ? (
                    <tr>
                      <td className="px-4 py-5 text-slate-500" colSpan={8}>
                        No reports have been loaded yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </NisrAdminLayout>
  );
}
