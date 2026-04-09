function safeText(value) {
  return String(value || '').trim().toLowerCase();
}

export function isWorkReportOwnedByUser(report, user) {
  if (!report || !user) return false;

  const reportUserId = String(report.createdByUserId ?? report.created_by_user_id ?? '').trim();
  const userId = String(user.id ?? '').trim();
  if (reportUserId && userId && reportUserId === userId) return true;

  const reportUsername = safeText(report.createdByUsername ?? report.created_by_username);
  const username = safeText(user.username);
  if (reportUsername && username && reportUsername === username) return true;

  const reportName = safeText(report.createdByName ?? report.created_by_name);
  const fullName = safeText(user.full_name);
  if (reportName && fullName && reportName === fullName) return true;

  return false;
}

export function getWorkReportOwnerLabel(report) {
  return String(
    report?.createdByName
    || report?.created_by_name
    || report?.createdByUsername
    || report?.created_by_username
    || 'Sin autor'
  ).trim();
}
