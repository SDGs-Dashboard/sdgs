const API_BASE = "http://127.0.0.1:8000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response;
}

export const api = {
  getSummary: () => request("/reports/dashboard/summary"),
  getReports: () => request("/reports"),
  getProposedUpdates: () => request("/proposed-updates"),
  uploadReport: (formData) =>
    request("/upload", {
      method: "POST",
      body: formData,
    }),
  runExtraction: (reportId) =>
    request(`/extraction/reports/${reportId}/run`, {
      method: "POST",
    }),
  reviewUpdate: (updateId, action) =>
    request(`/approvals/${updateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        reviewer: "staff",
      }),
    }),
  exportUrl: (kind) => `${API_BASE}/exports/${kind}`,
};
