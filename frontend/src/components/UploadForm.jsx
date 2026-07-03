import { useState } from "react";

export function UploadForm({ onSubmit }) {
  const [file, setFile] = useState(null);
  const [reportName, setReportName] = useState("");
  const [reportFamily, setReportFamily] = useState("");
  const [publicationYear, setPublicationYear] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("report_name", reportName || file.name.replace(/\.[^.]+$/, ""));
    formData.append("report_family", reportFamily);
    formData.append("publication_year", publicationYear);
    formData.append("owner", "staff");
    await onSubmit(formData);
    setFile(null);
    setReportName("");
    setReportFamily("");
    setPublicationYear("");
    event.target.reset();
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Upload Report</h2>
        <p>Excel and PDF reports only.</p>
      </div>
      <form className="upload-form" onSubmit={submit}>
        <input type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] || null)} />
        <input placeholder="Report name" value={reportName} onChange={(event) => setReportName(event.target.value)} />
        <input placeholder="Report family (EICV, DHS...)" value={reportFamily} onChange={(event) => setReportFamily(event.target.value)} />
        <input placeholder="Publication year" value={publicationYear} onChange={(event) => setPublicationYear(event.target.value)} />
        <button type="submit">Upload report</button>
      </form>
    </div>
  );
}
