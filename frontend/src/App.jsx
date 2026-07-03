import { useEffect, useState } from "react";

import { StatCard } from "./components/StatCard";
import { UploadForm } from "./components/UploadForm";
import { ReportsPanel } from "./components/ReportsPanel";
import { ProposedUpdatesTable } from "./components/ProposedUpdatesTable";
import { api } from "./services/api";

export default function App() {
  const [summary, setSummary] = useState(null);
  const [reports, setReports] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [message, setMessage] = useState("");
  const [busyReportId, setBusyReportId] = useState("");

  const loadAll = async () => {
    const [summaryData, reportsData, updatesData] = await Promise.all([
      api.getSummary(),
      api.getReports(),
      api.getProposedUpdates(),
    ]);
    setSummary(summaryData);
    setReports(reportsData);
    setUpdates(updatesData);
  };

  useEffect(() => {
    loadAll().catch((error) => setMessage(error.message));
  }, []);

  const handleUpload = async (formData) => {
    setMessage("Uploading report...");
    await api.uploadReport(formData);
    setMessage("Report uploaded.");
    await loadAll();
  };

  const handleExtract = async (reportId) => {
    setBusyReportId(reportId);
    setMessage("Running extraction...");
    await api.runExtraction(reportId);
    setBusyReportId("");
    setMessage("Extraction completed.");
    await loadAll();
  };

  const handleReview = async (updateId, action) => {
    setMessage(`Applying ${action}...`);
    await api.reviewUpdate(updateId, action);
    setMessage(`Update ${action}d.`);
    await loadAll();
  };

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <h1>NISR SDG Automation</h1>
          <p>Metadata-driven local workflow for importing, extracting, reviewing, approving, and exporting SDG updates.</p>
        </div>
        <div className="header-actions">
          <button onClick={() => window.open(api.exportUrl("dashboard"), "_blank")}>Export Dashboard</button>
          <button onClick={() => window.open(api.exportUrl("proposed-updates"), "_blank")}>Export Proposed</button>
          <button onClick={() => window.open(api.exportUrl("approved-updates"), "_blank")}>Export Approved</button>
          <button onClick={() => window.open(api.exportUrl("audit-log"), "_blank")}>Export Audit</button>
        </div>
      </header>

      {message ? <div className="message-banner">{message}</div> : null}

      <section className="stats-grid">
        <StatCard label="NISR indicators" value={summary?.nisr_indicators ?? "-"} />
        <StatCard label="Missing values" value={summary?.missing_values ?? "-"} />
        <StatCard label="Waiting review" value={summary?.proposed_updates_waiting_review ?? "-"} />
        <StatCard label="Approved updates" value={summary?.approved_updates ?? "-"} />
        <StatCard label="Reports processed" value={summary?.reports_processed ?? "-"} />
        <StatCard label="Success rate" value={summary ? `${summary.extraction_success_rate}%` : "-"} />
      </section>

      <section className="grid-two">
        <UploadForm onSubmit={handleUpload} />
        <ReportsPanel reports={reports} busyReportId={busyReportId} onExtract={handleExtract} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Proposed Updates</h2>
          <p>Review extracted values before they are written back to the dashboard data.</p>
        </div>
        <ProposedUpdatesTable updates={updates} onAction={handleReview} />
      </section>
    </div>
  );
}
