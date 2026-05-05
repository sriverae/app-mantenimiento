from __future__ import annotations

import math
import re
from datetime import date, datetime
from typing import Any


MAX_VALIDATION_ERRORS = 25
BLOCKED_TEXT_CHARS = set("<>{}[]\\")
SKIP_TEXT_KEYS = {
    "url",
    "dataUrl",
    "data_url",
    "previewUrl",
    "preview_url",
    "logoDataUrl",
    "logo_data_url",
    "filename",
    "password",
    "password_hash",
    "secret_answer_hash",
}
SKIP_TEXT_PREFIXES = ("data:", "http://", "https://", "/uploads/")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}(:\d{2})?$")
HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class SharedDocumentValidationError(ValueError):
    def __init__(self, errors: list[str]):
        self.errors = errors[:MAX_VALIDATION_ERRORS]
        suffix = "" if len(errors) <= MAX_VALIDATION_ERRORS else " | ..."
        super().__init__("Documento invalido: " + " | ".join(self.errors) + suffix)


def validate_shared_document_data(key: str, data: Any) -> None:
    errors: list[str] = []
    expected_shape = DOCUMENT_SHAPES.get(key, list)

    if expected_shape is list and not isinstance(data, list):
        _add(errors, "El documento debe ser una lista.")
    elif expected_shape is dict and not isinstance(data, dict):
        _add(errors, "El documento debe ser un objeto.")

    if not errors:
        _validate_text_tree(data, key, errors)
        validator = DOCUMENT_VALIDATORS.get(key)
        if validator:
            validator(data, errors)

    if errors:
        raise SharedDocumentValidationError(errors)


def _add(errors: list[str], message: str) -> None:
    if len(errors) < MAX_VALIDATION_ERRORS:
        errors.append(message)


def _is_blank(value: Any) -> bool:
    return str(value if value is not None else "").strip() == ""


def _as_number(value: Any) -> float | None:
    if _is_blank(value) or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _has_photo_source(photo: Any) -> bool:
    if not isinstance(photo, dict):
        return False
    return not _is_blank(
        photo.get("url")
        or photo.get("previewUrl")
        or photo.get("preview_url")
        or photo.get("dataUrl")
        or photo.get("data_url")
    )


def _validate_text_tree(value: Any, path: str, errors: list[str], key_name: str = "") -> None:
    if len(errors) >= MAX_VALIDATION_ERRORS:
        return
    if isinstance(value, dict):
        for child_key, child_value in value.items():
            child_key_text = str(child_key)
            child_path = f"{path}.{child_key_text}" if path else child_key_text
            _validate_text_tree(child_value, child_path, errors, child_key_text)
        return
    if isinstance(value, list):
        for index, child_value in enumerate(value):
            _validate_text_tree(child_value, f"{path}[{index}]", errors, key_name)
        return
    if isinstance(value, str):
        if key_name in SKIP_TEXT_KEYS or value.startswith(SKIP_TEXT_PREFIXES):
            return
        if any(char in value for char in BLOCKED_TEXT_CHARS):
            _add(errors, f"{path} contiene caracteres no permitidos: < > {{ }} [ ] \\.")
        if len(value) > 5000:
            _add(errors, f"{path} excede el largo permitido.")


def _iter_dict_rows(data: Any, label: str, errors: list[str]) -> list[tuple[int, dict[str, Any]]]:
    rows: list[tuple[int, dict[str, Any]]] = []
    if not isinstance(data, list):
        return rows
    for index, row in enumerate(data):
        if isinstance(row, dict):
            rows.append((index, row))
        else:
            _add(errors, f"{label}[{index}] debe ser un objeto.")
    return rows


def _require(row: dict[str, Any], field: str, path: str, errors: list[str]) -> None:
    if _is_blank(row.get(field)):
        _add(errors, f"{path}.{field} es obligatorio.")


def _require_any(row: dict[str, Any], fields: list[str], path: str, label: str, errors: list[str]) -> None:
    if all(_is_blank(row.get(field)) for field in fields):
        _add(errors, f"{path}.{label} es obligatorio.")


def _non_negative(row: dict[str, Any], field: str, path: str, errors: list[str], required: bool = False) -> None:
    value = row.get(field)
    if _is_blank(value):
        if required:
            _add(errors, f"{path}.{field} es obligatorio.")
        return
    number = _as_number(value)
    if number is None:
        _add(errors, f"{path}.{field} debe ser un numero valido.")
    elif number < 0:
        _add(errors, f"{path}.{field} no puede ser negativo.")


def _positive(row: dict[str, Any], field: str, path: str, errors: list[str], required: bool = True) -> None:
    value = row.get(field)
    if _is_blank(value):
        if required:
            _add(errors, f"{path}.{field} es obligatorio.")
        return
    number = _as_number(value)
    if number is None:
        _add(errors, f"{path}.{field} debe ser un numero valido.")
    elif number <= 0:
        _add(errors, f"{path}.{field} debe ser mayor a cero.")


def _scale_1_to_10(row: dict[str, Any], field: str, path: str, errors: list[str]) -> None:
    number = _as_number(row.get(field))
    if number is None or number < 1 or number > 10:
        _add(errors, f"{path}.{field} debe estar entre 1 y 10.")


def _date_field(row: dict[str, Any], field: str, path: str, errors: list[str], required: bool = False) -> None:
    value = row.get(field)
    if _is_blank(value):
        if required:
            _add(errors, f"{path}.{field} es obligatorio.")
        return
    text = str(value).strip()
    try:
        if not DATE_RE.match(text):
            raise ValueError
        date.fromisoformat(text)
    except ValueError:
        _add(errors, f"{path}.{field} debe tener formato YYYY-MM-DD.")


def _time_field(row: dict[str, Any], field: str, path: str, errors: list[str], required: bool = False) -> None:
    value = row.get(field)
    if _is_blank(value):
        if required:
            _add(errors, f"{path}.{field} es obligatorio.")
        return
    text = str(value).strip()
    if not TIME_RE.match(text):
        _add(errors, f"{path}.{field} debe tener formato HH:MM.")
        return
    hour, minute, *_ = text.split(":")
    if int(hour) > 23 or int(minute) > 59:
        _add(errors, f"{path}.{field} debe tener una hora valida.")


def _date_time_order(
    row: dict[str, Any],
    start_date: str,
    start_time: str,
    end_date: str,
    end_time: str,
    path: str,
    errors: list[str],
) -> None:
    _date_field(row, start_date, path, errors, required=True)
    _date_field(row, end_date, path, errors, required=True)
    _time_field(row, start_time, path, errors, required=True)
    _time_field(row, end_time, path, errors, required=True)
    if len(errors) >= MAX_VALIDATION_ERRORS:
        return
    try:
        start = datetime.fromisoformat(f"{row[start_date]}T{str(row[start_time])[:5]}:00")
        end = datetime.fromisoformat(f"{row[end_date]}T{str(row[end_time])[:5]}:00")
    except (KeyError, TypeError, ValueError):
        return
    if end <= start:
        _add(errors, f"{path} debe tener fecha/hora fin posterior al inicio.")


def _validate_rrhh(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "RRHH", errors):
        path = f"RRHH[{index}]"
        for field in ("codigo", "nombres_apellidos", "cargo", "especialidad"):
            _require(row, field, path, errors)
        _non_negative(row, "capacidad_hh_dia", path, errors)
        _non_negative(row, "disponibilidad_diaria_horas", path, errors)
        _non_negative(row, "costo_hora", path, errors)


def _validate_attendance(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Asistencia", errors):
        path = f"Asistencia[{index}]"
        _date_field(row, "fecha", path, errors, required=True)
        _require(row, "personal_id", path, errors)
        _require(row, "estado_asistencia", path, errors)
        _non_negative(row, "horas_programadas", path, errors, required=True)
        _non_negative(row, "horas_asistidas", path, errors, required=True)


def _validate_materials(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Materiales", errors):
        path = f"Materiales[{index}]"
        _require(row, "codigo", path, errors)
        _require(row, "descripcion", path, errors)
        for field in ("stock", "costo_unit", "stock_min"):
            _non_negative(row, field, path, errors)


def _validate_dropdown_lists(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Listas", errors):
        path = f"Listas[{index}]"
        _require(row, "key", path, errors)
        _require(row, "label", path, errors)
        options = row.get("options", [])
        if not isinstance(options, list):
            _add(errors, f"{path}.options debe ser una lista.")
        elif any(_is_blank(option) for option in options):
            _add(errors, f"{path}.options no debe tener valores vacios.")


def _validate_equipment_columns(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Columnas equipo", errors):
        path = f"Columnas equipo[{index}]"
        _require(row, "key", path, errors)
        _require(row, "label", path, errors)


def _validate_equipment_items(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Equipos", errors):
        path = f"Equipos[{index}]"
        _require(row, "codigo", path, errors)
        _require(row, "descripcion", path, errors)
        nodes = row.get("despiece", [])
        if nodes and not isinstance(nodes, list):
            _add(errors, f"{path}.despiece debe ser una lista.")
            continue
        for node_index, node in enumerate(nodes or []):
            node_path = f"{path}.despiece[{node_index}]"
            if not isinstance(node, dict):
                _add(errors, f"{node_path} debe ser un objeto.")
                continue
            _require_any(node, ["nombre", "descripcion"], node_path, "nombre", errors)


def _validate_amef(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "AMEF", errors):
        path = f"AMEF[{index}]"
        for field in ("funcion", "modo_falla", "causa_falla"):
            _require(row, field, path, errors)
        for field in ("severidad", "ocurrencia", "deteccion"):
            _scale_1_to_10(row, field, path, errors)


def _validate_packages(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Paquetes", errors):
        path = f"Paquetes[{index}]"
        _require(row, "codigo", path, errors)
        _require(row, "nombre", path, errors)
        _non_negative(row, "tiempo_min", path, errors)
        activities = row.get("actividades")
        if not isinstance(activities, list) or not activities:
            _add(errors, f"{path}.actividades debe tener al menos una actividad.")
        elif any(_is_blank(activity) for activity in activities):
            _add(errors, f"{path}.actividades no debe tener actividades vacias.")


def _validate_date_plans(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Planes fecha", errors):
        path = f"Planes fecha[{index}]"
        for field in ("codigo", "equipo", "responsable"):
            _require(row, field, path, errors)
        _date_field(row, "fecha_inicio", path, errors, required=True)
        _non_negative(row, "dias_anticipacion_alerta", path, errors)
        entries = row.get("cycle_entries") or []
        if not isinstance(entries, list) or not entries:
            _add(errors, f"{path}.cycle_entries debe tener al menos un paso.")
            continue
        _validate_cycle_entries(entries, path, "frecuencia_dias", errors)


def _validate_km_plans(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Planes contador", errors):
        path = f"Planes contador[{index}]"
        for field in ("codigo", "equipo", "responsable"):
            _require(row, field, path, errors)
        for field in ("km_actual", "km_ultimo_mantenimiento", "alerta_km", "km_por_dia", "proximo_km"):
            _non_negative(row, field, path, errors)
        _date_field(row, "fecha_toma", path, errors)
        entries = row.get("package_cycle") or []
        if not isinstance(entries, list) or not entries:
            _add(errors, f"{path}.package_cycle debe tener al menos un paquete.")
            continue
        _validate_cycle_entries(entries, path, "frecuencia", errors)


def _validate_cycle_entries(entries: list[Any], path: str, frequency_field: str, errors: list[str]) -> None:
    for entry_index, entry in enumerate(entries):
        entry_path = f"{path}.paso[{entry_index}]"
        if not isinstance(entry, dict):
            _add(errors, f"{entry_path} debe ser un objeto.")
            continue
        _positive(entry, frequency_field, entry_path, errors)
        activities = entry.get("actividades")
        if not isinstance(activities, list) or not activities:
            _add(errors, f"{entry_path}.actividades debe tener al menos una actividad.")
        elif any(_is_blank(activity) for activity in activities):
            _add(errors, f"{entry_path}.actividades no debe tener actividades vacias.")


def _validate_counter_history(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Historial contador", errors):
        path = f"Historial contador[{index}]"
        _require(row, "plan_id", path, errors)
        _non_negative(row, "valor_contador", path, errors, required=True)
        _date_field(row, "fecha_toma", path, errors, required=True)


def _validate_notices(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Avisos", errors):
        path = f"Avisos[{index}]"
        for field in ("codigo", "descripcion", "detalle", "categoria"):
            _require(row, field, path, errors)
        photos = row.get("problem_photos") or row.get("problemPhotos") or row.get("photos") or []
        if not isinstance(photos, list) or not any(_has_photo_source(photo) for photo in photos):
            _add(errors, f"{path}.problem_photos debe tener al menos una foto del problema.")


def _validate_ot_alerts(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "OT activas", errors):
        path = f"OT activas[{index}]"
        for field in ("codigo", "descripcion", "status_ot"):
            _require(row, field, path, errors)
        if not _is_blank(row.get("fecha_ejecutar")):
            _date_field(row, "fecha_ejecutar", path, errors)
        for material_index, material in enumerate(row.get("materiales_detalle") or []):
            if isinstance(material, dict):
                _positive(material, "cantidad", f"{path}.materiales[{material_index}]", errors)
            else:
                _add(errors, f"{path}.materiales[{material_index}] debe ser un objeto.")


def _validate_work_reports(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Reportes OT", errors):
        path = f"Reportes OT[{index}]"
        _require(row, "alertId", path, errors)
        _date_time_order(row, "fechaInicio", "horaInicio", "fechaFin", "horaFin", path, errors)
        evidence = row.get("evidencePhotos") or row.get("evidence_photos") or row.get("photos") or {}
        before = evidence.get("before") or evidence.get("antes") or evidence.get("ANTES") if isinstance(evidence, dict) else None
        after = evidence.get("after") or evidence.get("despues") or evidence.get("DESPUES") if isinstance(evidence, dict) else None
        if not _has_photo_source(before) or not _has_photo_source(after):
            _add(errors, f"{path}.evidencePhotos debe tener foto before y after.")
        report_type = str(row.get("reportType") or row.get("tipo") or "TRABAJO").upper()
        if report_type in {"SERVICIO", "SERVICE"}:
            _require_any(row, ["serviceProviderId", "serviceProviderName"], path, "proveedor de servicio", errors)
            _require(row, "serviceActivity", path, errors)
            _non_negative(row, "serviceCost", path, errors)
        else:
            techs = row.get("tecnicos") or []
            if not isinstance(techs, list) or not techs:
                _add(errors, f"{path}.tecnicos debe tener al menos un tecnico.")
            for tech_index, tech in enumerate(techs if isinstance(techs, list) else []):
                if not isinstance(tech, dict):
                    _add(errors, f"{path}.tecnicos[{tech_index}] debe ser un objeto.")
                    continue
                _require_any(tech, ["tecnico", "nombres_apellidos"], f"{path}.tecnicos[{tech_index}]", "tecnico", errors)
                _positive(tech, "horas", f"{path}.tecnicos[{tech_index}]", errors)
        for field, rows in (
            ("materialesConfirmados", row.get("materialesConfirmados") or []),
            ("materialesExtra", row.get("materialesExtra") or []),
        ):
            for material_index, material in enumerate(rows if isinstance(rows, list) else []):
                if isinstance(material, dict):
                    amount_field = "cantidadConfirmada" if field == "materialesConfirmados" else "cantidad"
                    _non_negative(material, amount_field, f"{path}.{field}[{material_index}]", errors)
                else:
                    _add(errors, f"{path}.{field}[{material_index}] debe ser un objeto.")


def _validate_ot_history(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Historial OT", errors):
        path = f"Historial OT[{index}]"
        for field in ("codigo", "descripcion"):
            _require(row, field, path, errors)
        cierre = row.get("cierre_ot") or {}
        if isinstance(cierre, dict) and cierre:
            for field in ("tiempo_efectivo_hh", "tiempo_indisponible_generico", "tiempo_indisponible_operacional"):
                _non_negative(cierre, field, f"{path}.cierre_ot", errors)


def _validate_ot_sequence(data: Any, errors: list[str]) -> None:
    for index, row in _iter_dict_rows(data, "Secuencia OT", errors):
        path = f"Secuencia OT[{index}]"
        _positive(row, "year", path, errors)
        _positive(row, "start_number", path, errors)
        _non_negative(row, "last_number", path, errors, required=True)
        start_number = _as_number(row.get("start_number"))
        last_number = _as_number(row.get("last_number"))
        if start_number is not None and last_number is not None and last_number + 1 < start_number:
            _add(errors, f"{path}.last_number no puede dejar el siguiente numero por debajo del inicio.")


def _validate_pdf_format(data: Any, errors: list[str]) -> None:
    if not isinstance(data, dict):
        return
    for field in ("documentTitle", "companyTitle", "documentSubtitle"):
        if field in data and _is_blank(data.get(field)):
            _add(errors, f"Formato PDF.{field} es obligatorio.")
    if data.get("showNoticeAnnex", True):
        for field in ("noticeDocumentTitle", "noticeSubtitle"):
            if _is_blank(data.get(field)):
                _add(errors, f"Formato PDF.{field} es obligatorio.")
    for field, minimum, maximum in PDF_NUMBER_RANGES:
        if field in data:
            value = _as_number(data.get(field))
            if value is None or value < minimum or value > maximum:
                _add(errors, f"Formato PDF.{field} debe estar entre {minimum} y {maximum}.")
    for field in PDF_COLOR_FIELDS:
        if field in data and not HEX_COLOR_RE.match(str(data.get(field) or "")):
            _add(errors, f"Formato PDF.{field} debe ser un color hexadecimal valido.")


PDF_NUMBER_RANGES = (
    ("rowActivityCount", 1, 30),
    ("rowPersonnelCount", 1, 20),
    ("rowMaterialCount", 1, 40),
    ("titleFontSize", 12, 36),
    ("cellFontSize", 6, 16),
    ("labelFontSize", 6, 14),
    ("sectionFontSize", 6, 16),
    ("reportFontSize", 6, 14),
    ("signatureFontSize", 6, 14),
    ("cellPaddingVertical", 1, 10),
    ("cellPaddingHorizontal", 1, 12),
    ("borderWidth", 0.5, 4),
    ("outerBorderWidth", 1, 6),
    ("workEvidencePhotoHeight", 60, 360),
    ("noticePhotoHeight", 60, 360),
)

PDF_COLOR_FIELDS = (
    "primaryColor",
    "titleTextColor",
    "sectionColor",
    "sectionTextColor",
    "accentColor",
    "accentTextColor",
    "greenColor",
    "headerTextColor",
    "bodyTextColor",
    "pageBackgroundColor",
    "sheetBackgroundColor",
    "borderColor",
    "logoBackgroundColor",
    "logoBorderColor",
    "labelBackgroundColor",
    "labelTextColor",
    "valueBackgroundColor",
    "valueTextColor",
    "highlightBackgroundColor",
    "highlightTextColor",
    "statusBackgroundColor",
    "statusTextColor",
    "observationsBackgroundColor",
    "technicalNoteBackgroundColor",
    "signatureLineColor",
    "noticeHeaderColor",
    "noticeHeaderTextColor",
)

DOCUMENT_SHAPES = {
    "pmp_ot_pdf_format_v1": dict,
}

DOCUMENT_VALIDATORS = {
    "pmp_rrhh_tecnicos_v1": _validate_rrhh,
    "pmp_rrhh_asistencia_v1": _validate_attendance,
    "pmp_dropdown_lists_v1": _validate_dropdown_lists,
    "pmp_materiales_v1": _validate_materials,
    "pmp_equipos_columns_v1": _validate_equipment_columns,
    "pmp_equipos_items_v1": _validate_equipment_items,
    "pmp_amef_v1": _validate_amef,
    "pmp_fechas_plans_v1": _validate_date_plans,
    "pmp_km_plans_v1": _validate_km_plans,
    "pmp_km_counters_history_v1": _validate_counter_history,
    "pmp_paquetes_mantenimiento_v1": _validate_packages,
    "pmp_avisos_mantenimiento_v1": _validate_notices,
    "pmp_ot_alertas_v1": _validate_ot_alerts,
    "pmp_ot_sequence_settings_v1": _validate_ot_sequence,
    "pmp_ot_historial_v1": _validate_ot_history,
    "pmp_ot_work_reports_v1": _validate_work_reports,
    "pmp_ot_pdf_format_v1": _validate_pdf_format,
}
