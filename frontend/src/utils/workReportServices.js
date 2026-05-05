export const isServiceWorkReport = (report) => (
  String(report?.reportType || report?.tipo_registro || '').toUpperCase() === 'SERVICIO'
);

export const getServiceCost = (report) => {
  const parsed = Number(report?.serviceCost ?? report?.costo_servicio ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const isServiceAllInclusive = (report) => (
  !!(report?.serviceAllInclusive ?? report?.todo_costo ?? report?.todoCosto)
);

export const getServiceProviderLabel = (report) => {
  const providerName = String(report?.serviceProviderName || report?.tercero_nombre || '').trim();
  const providerCompany = String(report?.serviceCompany || report?.tercero_empresa || '').trim();
  if (providerName && providerCompany && providerCompany !== providerName) {
    return `${providerName} · ${providerCompany}`;
  }
  return providerName || providerCompany || 'Tercero no especificado';
};

export const getWorkReportTypeLabel = (report) => (
  isServiceWorkReport(report) ? 'Servicio' : 'Trabajo'
);

export const summarizeServiceReports = (reports = []) => {
  const serviceReports = (Array.isArray(reports) ? reports : []).filter(isServiceWorkReport);
  const missingCostReports = serviceReports.filter((report) => getServiceCost(report) <= 0);
  const totalServiceCost = Number(serviceReports.reduce((sum, report) => sum + getServiceCost(report), 0).toFixed(2));

  return {
    serviceReports,
    missingCostReports,
    totalServiceCost,
    hasMissingServiceCost: missingCostReports.length > 0,
  };
};
