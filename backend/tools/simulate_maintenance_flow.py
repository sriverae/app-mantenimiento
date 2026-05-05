from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


SHARED_DOCUMENT_KEYS = {
    "rrhh": "pmp_rrhh_tecnicos_v1",
    "rrhhAttendance": "pmp_rrhh_asistencia_v1",
    "configurableLists": "pmp_dropdown_lists_v1",
    "materials": "pmp_materiales_v1",
    "equipmentColumns": "pmp_equipos_columns_v1",
    "equipmentItems": "pmp_equipos_items_v1",
    "equipmentExchangeHistory": "pmp_equipos_exchange_history_v1",
    "amef": "pmp_amef_v1",
    "maintenancePlans": "pmp_fechas_plans_v1",
    "maintenancePlansKm": "pmp_km_plans_v1",
    "maintenanceCountersHistory": "pmp_km_counters_history_v1",
    "maintenancePackages": "pmp_paquetes_mantenimiento_v1",
    "maintenanceNotices": "pmp_avisos_mantenimiento_v1",
    "executiveAudit": "pmp_executive_audit_v1",
    "otAlerts": "pmp_ot_alertas_v1",
    "otDeleted": "pmp_ot_deleted_v1",
    "otSequenceSettings": "pmp_ot_sequence_settings_v1",
    "otHistory": "pmp_ot_historial_v1",
    "otWorkReports": "pmp_ot_work_reports_v1",
    "otPdfFormat": "pmp_ot_pdf_format_v1",
    "bajasHistory": "pmp_bajas_history_v1",
}


SIM_PASSWORD = "Simula1234!"
SIM_YEAR = 2026
BASE_DATE = datetime(2026, 4, 21)


def iso_at(day: int, hour: int = 8, minute: int = 0) -> str:
    return datetime(SIM_YEAR, 4, day, hour, minute).isoformat()


def date_at(day: int) -> str:
    return f"{SIM_YEAR}-04-{day:02d}"


def money(value: float) -> float:
    return round(float(value), 2)


def compact(text: str) -> str:
    return " ".join(str(text or "").split())


def build_users() -> list[dict]:
    return [
        {"username": "ing_sim", "full_name": "Ingrid Vargas Jefa Mantto", "role": "INGENIERO"},
        {"username": "planner_sim", "full_name": "Paolo Medina Planner", "role": "PLANNER"},
        {"username": "enc_mec", "full_name": "Carlos Salazar Encargado Mecanico", "role": "ENCARGADO"},
        {"username": "enc_ele", "full_name": "Rosa Villanueva Encargada Electrica", "role": "ENCARGADO"},
        {"username": "tec_mcruz", "full_name": "Manuel de la Cruz Jimenez", "role": "TECNICO"},
        {"username": "tec_halauce", "full_name": "Hernan Alauce Alarcon", "role": "TECNICO"},
        {"username": "tec_jperez", "full_name": "Juan Perez Huaman", "role": "TECNICO"},
        {"username": "tec_lquispe", "full_name": "Luis Quispe Torres", "role": "TECNICO"},
        {"username": "tec_atorres", "full_name": "Ana Torres Rios", "role": "TECNICO"},
        {"username": "sup_kt", "full_name": "Kiara Tenorio Supervisora", "role": "SUPERVISOR"},
        {"username": "ope_rl", "full_name": "Ruben Lopez Operador", "role": "OPERADOR"},
    ]


def build_rrhh() -> list[dict]:
    own_people = [
        ("MEC-1", "Manuel de la Cruz Jimenez", "Tecnico", "Mecanico", "tec_mcruz", 12.0, 8.5),
        ("ELE-1", "Hernan Alauce Alarcon", "Tecnico", "Electrico", "tec_halauce", 12.0, 8.0),
        ("MEC-2", "Juan Perez Huaman", "Tecnico", "Mecanico", "tec_jperez", 11.0, 7.8),
        ("SOL-1", "Luis Quispe Torres", "Tecnico", "Soldador", "tec_lquispe", 10.0, 9.2),
        ("INS-1", "Ana Torres Rios", "Tecnico", "Instrumentista", "tec_atorres", 12.0, 6.5),
        ("ENC-M", "Carlos Salazar Encargado Mecanico", "Encargado", "Mecanico", "enc_mec", 12.0, 11.5),
        ("ENC-E", "Rosa Villanueva Encargada Electrica", "Encargado", "Electrico", "enc_ele", 12.0, 11.0),
    ]
    rows = []
    for index, (code, name, cargo, specialty, username, hours, cost) in enumerate(own_people, start=1):
        rows.append({
            "id": index,
            "codigo": code,
            "nombres_apellidos": name,
            "cargo": cargo,
            "especialidad": specialty,
            "tipo_personal": "Propio",
            "empresa": "N.A.",
            "identificacion": f"DNI-{74000000 + index}",
            "edad": str(26 + index),
            "domicilio": "Planta",
            "capacidad_hh_dia": f"{hours:.2f}",
            "costo_hora": f"{cost:.2f}",
            "email": f"{username}@sim.local",
            "turno_principal": "Horario definido",
            "hora_entrada": "07:00",
            "hora_salida": "19:00" if hours >= 11 else "18:00",
            "refrigerios": [{"id": f"ref_{code}", "inicio": "13:00", "fin": "14:00"}],
            "disponibilidad_diaria_horas": f"{hours:.2f}",
            "disponibilidad_estado": "Disponible",
            "certificaciones": "Trabajo en altura, bloqueo LOTO",
            "certificacion_vencimiento": date_at(30),
            "competencias": "Mantenimiento planta, seguridad industrial",
            "usuario_acceso": username,
            "usuario_role": "ENCARGADO" if cargo == "Encargado" else ("OPERADOR" if cargo == "Operador" else "TECNICO"),
            "sincronizar_cuenta": True,
        })

    third_parties = [
        ("TER-1", "Taller Casas SAC", "Otro", "Mecanico", "Taller Casas", 18.0, "Reparacion de reductores, rodamientos y alineamiento"),
        ("TER-2", "ElectroServicios Norte", "Otro", "Electrico", "ElectroServicios Norte", 22.0, "Tableros, variadores y motores electricos"),
    ]
    for offset, (code, name, cargo, specialty, company, cost, coverage) in enumerate(third_parties, start=len(rows) + 1):
        rows.append({
            "id": offset,
            "codigo": code,
            "nombres_apellidos": name,
            "cargo": cargo,
            "especialidad": specialty,
            "tipo_personal": "Tercero",
            "empresa": company,
            "identificacion": f"RUC-20{offset:09d}",
            "edad": "N.A.",
            "domicilio": "Servicio externo",
            "capacidad_hh_dia": "0.00",
            "costo_hora": f"{cost:.2f}",
            "email": f"contacto{offset}@tercero.local",
            "turno_principal": "N.A.",
            "hora_entrada": "",
            "hora_salida": "",
            "refrigerios": [],
            "disponibilidad_diaria_horas": "0.00",
            "disponibilidad_estado": "N.A.",
            "certificaciones": "N.A.",
            "certificacion_vencimiento": "",
            "competencias": "N.A.",
            "supervisor_empresa": f"Supervisor {company}",
            "telefono_contacto": f"+51 999 000 {offset:03d}",
            "cobertura_servicio": coverage,
            "usuario_acceso": "",
            "usuario_role": "",
            "sincronizar_cuenta": False,
        })
    return rows


def build_equipment() -> list[dict]:
    raw = [
        ("IAISPL1", "Pre Limpia Sabreca N 1", "Secado", "Sabreca", "PL-100", "V.C - DIA", "Alta"),
        ("IAISPL2", "Pre Limpia Superbrix N 2", "Secado", "Superbrix", "PL-200", "V.C - DIA", "Media"),
        ("IAISC1", "Secadora Sabreca N 1", "Secado", "Sabreca", "SC-31TN", "V.C - HRA", "Alta"),
        ("IAISC3", "Secadora Superbrix N 3", "Secado", "Superbrix", "SC-33TN", "V.C - HRA", "Alta"),
        ("IAISHC1", "Horno quemador de cascarilla", "Secado", "N.A.", "HQ-01", "V.C - DIA", "Critica"),
        ("CAR-XX002", "Cargador frontal", "Contabilidad", "Komatsu", "WA470-6", "V.C - HRA", "Alta"),
        ("CAR-XX003", "Camion tolva", "Logistica", "Volvo", "FMX480", "V.C - KM", "Media"),
        ("MON-01", "Montacargas planta", "Planta", "Toyota", "8FG", "V.C - KM", "Media"),
        ("COM-01", "Compresor principal", "Servicios", "Atlas Copco", "GA55", "V.C - HRA", "Critica"),
        ("BOM-01", "Bomba agua proceso", "Planta", "KSB", "ETA125", "V.C - DIA", "Alta"),
    ]
    equipment = []
    for index, (code, desc, area, brand, model, vc, criticality) in enumerate(raw, start=1):
        root = code
        equipment.append({
            "id": index,
            "codigo": code,
            "descripcion": desc,
            "area_trabajo": area,
            "criticidad": criticality,
            "marca": brand,
            "modelo": model,
            "vc": vc,
            "capacidad": "N.A.",
            "potencia_kw": str(1.5 + index),
            "amperaje": "N.A.",
            "voltaje_trabajo": "220 / 440 V" if index <= 5 else "24 V / 380 V",
            "estado": "Operativo",
            "despiece": [
                {"id": f"{root}-MOT", "parentId": "", "codigo_sub": f"{root}-1", "nombre": "Motor principal", "detalle": "Accionamiento principal", "caracteristicas": [{"descripcion": "Potencia", "valor": f"{2 + index} kW"}]},
                {"id": f"{root}-TRN", "parentId": "", "codigo_sub": f"{root}-2", "nombre": "Transmision", "detalle": "Fajas, cadenas o acoplamientos", "caracteristicas": [{"descripcion": "Tipo", "valor": "Mecanica"}]},
                {"id": f"{root}-CTL", "parentId": "", "codigo_sub": f"{root}-3", "nombre": "Control electrico", "detalle": "Tablero, sensores y protecciones", "caracteristicas": [{"descripcion": "Tension", "valor": "380 V"}]},
                {"id": f"{root}-MOT-ROD", "parentId": f"{root}-MOT", "codigo_sub": f"{root}-1-1", "nombre": "Rodamientos motor", "detalle": "Apoyos lado carga y ventilador", "caracteristicas": []},
            ],
        })
    return equipment


def build_equipment_columns() -> list[dict]:
    return [
        {"key": "codigo", "label": "Codigo"},
        {"key": "descripcion", "label": "Descripcion"},
        {"key": "area_trabajo", "label": "Area de trabajo"},
        {"key": "criticidad", "label": "Criticidad"},
        {"key": "marca", "label": "Marca"},
        {"key": "modelo", "label": "Modelo"},
        {"key": "vc", "label": "V.C"},
        {"key": "potencia_kw", "label": "Potencia (kW)"},
        {"key": "voltaje_trabajo", "label": "Voltaje de trabajo"},
        {"key": "estado", "label": "Estado"},
    ]


def build_materials() -> list[dict]:
    rows = [
        ("PRD000001", "ACEITE 15W40 CAT X 5 GL", "CAT", "Ferreyros", 140, "GLN", 136.67, 20),
        ("PRD000002", "FAJA B-78", "Gates", "Industrias Lima", 42, "UND", 38.50, 10),
        ("PRD000003", "RODAMIENTO 6205 2RS", "SKF", "Rodamientos SAC", 85, "UND", 24.20, 15),
        ("PRD000004", "CONTACTOR 32A 220V", "Schneider", "ElectroPartes", 18, "UND", 95.00, 5),
        ("PRD000005", "SENSOR INDUCTIVO M18", "IFM", "Automatiza", 22, "UND", 110.00, 4),
        ("PRD000006", "GRASA EP2 CARTUCHO", "Mobil", "LubriNorte", 96, "UND", 18.20, 12),
        ("PRD000007", "CADENA ASA 60", "Tsubaki", "Industrias Lima", 30, "M", 48.00, 8),
        ("PRD000008", "FILTRO ACEITE MOTOR", "Fleetguard", "Ferreyros", 28, "UND", 72.00, 6),
        ("PRD000009", "FILTRO AIRE PRIMARIO", "Donaldson", "Ferreyros", 20, "UND", 115.00, 4),
        ("PRD000010", "VALVULA BOLA 2 PULG", "KSB", "Valvulas Peru", 12, "UND", 155.00, 3),
        ("PRD000011", "MANGUERA HIDRAULICA 1/2", "Parker", "Hidraulica SAC", 25, "M", 39.00, 5),
        ("PRD000012", "RELE TERMICO 16-24A", "Schneider", "ElectroPartes", 14, "UND", 88.00, 3),
        ("PRD000013", "PERNO 1/2 X 2 GR8", "N.A.", "Ferreteria Sur", 500, "UND", 0.85, 100),
        ("PRD000014", "CINTA AISLANTE 3M", "3M", "ElectroPartes", 60, "UND", 8.50, 10),
        ("PRD000015", "ACEITE HIDRAULICO ISO 68", "Mobil", "LubriNorte", 90, "GLN", 118.00, 20),
    ]
    return [
        {
            "id": index,
            "codigo": code,
            "descripcion": desc,
            "marca": brand,
            "proveedor": supplier,
            "stock": stock,
            "unidad": unit,
            "costo_unit": cost,
            "costo_total": money(stock * cost),
            "stock_min": min_stock,
        }
        for index, (code, desc, brand, supplier, stock, unit, cost, min_stock) in enumerate(rows, start=1)
    ]


def build_packages() -> list[dict]:
    package_defs = [
        ("PK-DIA-001", "V.C - DIA", "PRELIMPIA PM1", 60, ["Inspeccion visual general", "Limpieza de componentes", "Verificacion de ajuste de pernos"]),
        ("PK-DIA-002", "V.C - DIA", "BOMBA PROCESO PM1", 75, ["Revision de sello mecanico", "Verificacion de vibracion", "Prueba de caudal"]),
        ("PK-DIA-003", "V.C - DIA", "HORNO PM1", 90, ["Inspeccion de quemador", "Limpieza de ductos", "Revision de sensores de temperatura"]),
        ("PK-HRA-001", "V.C - HRA", "SECADORA 250H", 120, ["Engrase de rodamientos", "Revision de cadenas", "Medicion de vibracion"]),
        ("PK-HRA-002", "V.C - HRA", "COMPRESOR 500H", 140, ["Cambio de filtro aceite", "Revision de correas", "Drenaje de condensados"]),
        ("PK-HRA-003", "V.C - HRA", "CARGADOR 250H", 160, ["Cambio de aceite motor", "Inspeccion hidraulica", "Revision de frenos"]),
        ("PK-KM-001", "V.C - KM", "MONTACARGAS 250KM", 100, ["Cambio de aceite", "Revision de frenos", "Inspeccion de horquillas"]),
        ("PK-KM-002", "V.C - KM", "CAMION 5000KM", 180, ["Cambio de filtros", "Revision tren delantero", "Inspeccion de suspension"]),
        ("PK-KM-003", "V.C - KM", "CAMION 10000KM", 220, ["Servicio completo motor", "Cambio aceite transmision", "Calibracion de frenos"]),
        ("PK-DIA-004", "V.C - DIA", "TABLERO ELECTRICO PM1", 80, ["Ajuste de borneras", "Limpieza interna", "Termografia basica"]),
    ]
    return [
        {
            "id": index,
            "codigo": code,
            "vc": vc,
            "nombre": name,
            "tiempo_min": minutes,
            "actividades": activities,
        }
        for index, (code, vc, name, minutes, activities) in enumerate(package_defs, start=1)
    ]


def cycle_entry(index: int, package: dict, frequency: int) -> dict:
    return {
        "item": index,
        "marker": f"PM{index}",
        "source_type": "package",
        "label": package["nombre"],
        "frecuencia_dias": frequency,
        "package_id": package["id"],
        "package_codigo": package["codigo"],
        "package_nombre": package["nombre"],
        "actividades": package["actividades"],
        "vc": package["vc"],
    }


def manual_cycle_entry(index: int, label: str, frequency: int, activities: list[str]) -> dict:
    return {
        "item": index,
        "marker": f"PM{index}",
        "source_type": "manual",
        "label": label,
        "frecuencia_dias": frequency,
        "actividades": activities,
        "vc": "V.C - DIA",
    }


def build_date_plans(equipment: list[dict], packages: list[dict]) -> list[dict]:
    plans = []
    for index, eq in enumerate(equipment, start=1):
        pkg = packages[(index - 1) % len(packages)]
        secondary = packages[index % len(packages)]
        if eq["vc"] == "V.C - KM":
            entries = [manual_cycle_entry(1, "Inspeccion diaria movil", 30, ["Revision visual", "Verificacion de fugas", "Limpieza de cabina"])]
        else:
            entries = [
                cycle_entry(1, pkg, 30 if index % 2 else 45),
                cycle_entry(2, secondary, 60 if index % 2 else 90),
            ]
        plans.append({
            "id": index,
            "codigo": eq["codigo"],
            "equipo": eq["descripcion"],
            "area_trabajo": eq["area_trabajo"],
            "prioridad": eq["criticidad"] if eq["criticidad"] in {"Alta", "Media", "Baja", "Critica"} else "Media",
            "responsable": "Electricista" if "Control" in entries[0]["label"] or index % 4 == 0 else "Mecanicos",
            "fecha_inicio": date_at((index % 10) + 1),
            "dias_anticipacion_alerta": 3 if eq["criticidad"] in {"Alta", "Critica"} else 1,
            "cycle_entries": entries,
            "actividades": "\n".join(entries[0]["actividades"]),
            "paquete_id": entries[0].get("package_id", ""),
            "frecuencia": f"{len(entries)} pasos",
        })
    return plans


def build_km_plans(equipment: list[dict], packages: list[dict]) -> tuple[list[dict], list[dict]]:
    mobile = [eq for eq in equipment if eq["vc"] in {"V.C - KM", "V.C - HRA"}][:5]
    km_packages = [pkg for pkg in packages if pkg["vc"] in {"V.C - KM", "V.C - HRA"}]
    plans = []
    history = []
    for index, eq in enumerate(mobile, start=1):
        pkg_a = km_packages[(index - 1) % len(km_packages)]
        pkg_b = km_packages[index % len(km_packages)]
        interval = 250 if eq["vc"] == "V.C - KM" else 250
        current = 240 + (index - 1) * 260
        last = max(current - interval, 0)
        next_counter = last + interval
        plan = {
            "id": index,
            "codigo": eq["codigo"],
            "equipo": eq["descripcion"],
            "area_trabajo": eq["area_trabajo"],
            "marca": eq["marca"],
            "modelo": eq["modelo"],
            "vc": "Km" if eq["vc"] == "V.C - KM" else "Hra",
            "prioridad": eq["criticidad"],
            "responsable": "Mecanicos",
            "km_actual": current,
            "km_ultimo_mantenimiento": last,
            "intervalo_km": interval,
            "alerta_km": 20 if index == 1 else 50,
            "km_por_dia": 10 if eq["vc"] == "V.C - KM" else 8,
            "fecha_ultimo_servicio": date_at(5),
            "fecha_toma": date_at(13),
            "tipo_pm_ultimo": "PM0",
            "tipo_pm_proximo": "PM1",
            "actividades": "\n".join(pkg_a["actividades"]),
            "paquete_id": pkg_a["id"],
            "paquete_codigo": pkg_a["codigo"],
            "paquete_nombre": pkg_a["nombre"],
            "proximo_km": next_counter,
            "has_previous_maintenance": index > 1,
            "package_cycle": [
                {
                    "item": 1,
                    "tipo_pm": "PM1",
                    "frecuencia": interval,
                    "vc": "Km" if eq["vc"] == "V.C - KM" else "Hra",
                    "package_id": pkg_a["id"],
                    "package_codigo": pkg_a["codigo"],
                    "package_nombre": pkg_a["nombre"],
                    "actividades": pkg_a["actividades"],
                },
                {
                    "item": 2,
                    "tipo_pm": "PM2",
                    "frecuencia": interval * 2,
                    "vc": "Km" if eq["vc"] == "V.C - KM" else "Hra",
                    "package_id": pkg_b["id"],
                    "package_codigo": pkg_b["codigo"],
                    "package_nombre": pkg_b["nombre"],
                    "actividades": pkg_b["actividades"],
                },
            ],
            "current_cycle_index": 0,
        }
        plans.append(plan)
        history.append({
            "id": f"counter_{index}_initial",
            "plan_id": index,
            "codigo": eq["codigo"],
            "equipo": eq["descripcion"],
            "valor_contador": current,
            "fecha_toma": date_at(13),
            "registrado_en": iso_at(13, 9, index),
            "registrado_por": "planner_sim",
            "origen": "PLAN_INICIAL",
            "observacion": "Carga inicial de simulacion.",
        })
    return plans, history


def build_amef(equipment: list[dict]) -> list[dict]:
    rows = []
    failure_modes = [
        ("Rodamiento con temperatura elevada", "Lubricacion insuficiente", "Engrase, medicion de vibracion y cambio si aplica"),
        ("Faja patina o presenta desgaste", "Tension inadecuada o polea desalineada", "Alinear poleas y regular tension"),
        ("Falla de sensor de posicion", "Contaminacion por polvo o cable flojo", "Limpiar sensor y ajustar conexion"),
    ]
    for eq in equipment:
        for offset, (mode, cause, action) in enumerate(failure_modes[:2], start=1):
            component = eq["despiece"][offset - 1]
            sev = 7 if eq["criticidad"] in {"Alta", "Critica"} else 5
            occ = 5 + offset
            det = 4 + offset
            rows.append({
                "id": f"amef_{eq['codigo']}_{offset}",
                "equipo_id": eq["id"],
                "equipo_codigo": eq["codigo"],
                "equipo_descripcion": eq["descripcion"],
                "equipo_area": eq["area_trabajo"],
                "componente_id": component["id"],
                "componente_codigo": component["codigo_sub"],
                "componente_nombre": component["nombre"],
                "componente_nivel": 2,
                "funcion": "Mantener la funcion operativa del equipo sin interrupciones.",
                "modo_falla": mode,
                "efecto_falla": "Parada parcial, perdida de rendimiento o riesgo de falla repetitiva.",
                "severidad": sev,
                "causa_falla": cause,
                "ocurrencia": occ,
                "controles_actuales": "Inspeccion PMP y monitoreo por tecnica de mantenimiento.",
                "deteccion_metodo": "Visual, vibracion, temperatura o ruido anormal.",
                "deteccion": det,
                "accion_recomendada": action,
                "responsable_accion": "Mecanicos",
                "fecha_compromiso": date_at(28),
                "estado_accion": "Pendiente" if offset == 1 else "En proceso",
            })
    return rows


def material_ref(materials: list[dict], index: int, qty: float = 1) -> dict:
    item = materials[(index - 1) % len(materials)]
    return {
        "id": item["id"],
        "materialId": item["id"],
        "codigo": item["codigo"],
        "descripcion": item["descripcion"],
        "cantidad": qty,
        "unidad": item["unidad"],
        "costo_unit": item["costo_unit"],
    }


def staff_ref(rrhh: list[dict], code: str) -> dict:
    item = next(row for row in rrhh if row["codigo"] == code)
    return {
        "id": item["id"],
        "codigo": item["codigo"],
        "nombres_apellidos": item["nombres_apellidos"],
        "especialidad": item["especialidad"],
        "cargo": item["cargo"],
        "tipo_personal": item["tipo_personal"],
        "capacidad_hh_dia": item["capacidad_hh_dia"],
        "costo_hora": item["costo_hora"],
        "usuario_acceso": item.get("usuario_acceso", ""),
    }


def build_active_ots(equipment: list[dict], materials: list[dict], rrhh: list[dict]) -> list[dict]:
    rows = []
    statuses = ["Pendiente", "Pendiente", "Pendiente", "Creada", "Creada", "Liberada", "Liberada", "Liberada", "Liberada", "Solicitud de cierre"]
    ot_sequence = 11
    for index, eq in enumerate(equipment[:10], start=1):
        status = statuses[index - 1]
        is_released = status in {"Liberada", "Solicitud de cierre"}
        personal = [staff_ref(rrhh, "MEC-1" if index % 2 else "ELE-1")]
        if is_released and index % 3 == 0:
            personal.append(staff_ref(rrhh, "MEC-2"))
        materials_detail = [material_ref(materials, index, 1)]
        row = {
            "id": f"ot_active_{index}",
            "fecha_ejecutar": date_at(index + 1),
            "fecha_programada": date_at(index + 1),
            "codigo": eq["codigo"],
            "descripcion": eq["descripcion"],
            "area_trabajo": eq["area_trabajo"],
            "prioridad": eq["criticidad"] if eq["criticidad"] in {"Alta", "Media", "Baja", "Critica"} else "Media",
            "actividad": f"PM{(index % 2) + 1} - {eq['descripcion']}\nInspeccion, limpieza y ajuste operativo.",
            "responsable": "Electricista" if index % 4 == 0 else "Mecanicos",
            "status_ot": status,
            "ot_numero": f"OT-{SIM_YEAR}-{ot_sequence:06d}" if is_released else "",
            "fecha_ejecucion": date_at(index + 1) if is_released else "",
            "tipo_mantto": "Preventivo",
            "personal_mantenimiento": ", ".join(f"{p['codigo']} - {p['nombres_apellidos']}" for p in personal) if is_released else "",
            "materiales": ", ".join(f"{m['codigo']} x{m['cantidad']}" for m in materials_detail) if is_released else "",
            "personal_detalle": personal if is_released else [],
            "materiales_detalle": materials_detail if is_released else [],
            "registro_ot": {
                "fecha_inicio": date_at(index + 1),
                "fecha_fin": date_at(index + 2),
                "hora_inicio": "07:00",
                "hora_fin": "18:00",
                "observaciones": "OT liberada dentro del periodo de simulacion.",
                "fecha_liberacion": iso_at(index + 1, 7, 30),
                "liberado_por": "Carlos Salazar Encargado Mecanico",
            } if is_released else None,
            "cierre_ot": {
                "solicitud_cierre": True,
                "solicitud_cierre_at": iso_at(17, 16, 30),
                "solicitud_cierre_by": "Carlos Salazar Encargado Mecanico",
            } if status == "Solicitud de cierre" else None,
            "origen_programacion": "PMP_FECHAS" if index <= 7 else "PMP_KM",
            "fecha_emision_aviso": iso_at(max(1, index), 8, 0),
            "fecha_aceptacion_aviso": iso_at(max(1, index), 8, 20),
        }
        if is_released:
            ot_sequence += 1
        if index == 8:
            row.update({
                "fecha_reprogramacion": date_at(19),
                "reprogramado_por": "planner_sim",
                "motivo_reprogramacion": "Equipo detenido por produccion, se reprograma para ventana segura.",
                "reprogramaciones": [
                    {
                        "fecha_anterior": date_at(index + 1),
                        "fecha_nueva": date_at(19),
                        "motivo": "Equipo detenido por produccion.",
                        "reprogramado_por": "planner_sim",
                        "reprogramado_at": iso_at(16, 10, 0),
                    }
                ],
            })
        rows.append(row)
    return rows


def work_report(alert: dict, sequence: int, rrhh: list[dict], materials: list[dict], *,
                start_day: int, end_day: int, hours: float, technicians: list[str],
                report_type: str = "internal", service_cost: float = 0.0) -> dict:
    tech_rows = [staff_ref(rrhh, code) for code in technicians]
    service = report_type == "service"
    report = {
        "id": f"wr_{alert['id']}_{sequence}",
        "alertId": alert["id"],
        "otNumero": alert.get("ot_numero", ""),
        "sequence": sequence,
        "reportCode": f"NT{sequence}-{alert.get('ot_numero') or alert['id']}",
        "createdByUsername": tech_rows[0].get("usuario_acceso", "tec_mcruz") if tech_rows else "enc_mec",
        "createdByName": tech_rows[0]["nombres_apellidos"] if tech_rows else "Tercero",
        "createdAt": iso_at(start_day, 10, 0),
        "updatedAt": iso_at(end_day, 18, 0),
        "reportType": report_type,
        "tecnicos": tech_rows,
        "materialesConfirmados": [
            {
                **material_ref(materials, sequence, 1),
                "confirmada": True,
                "cantidadConfirmada": 1,
            }
        ] if not service else [],
        "materialesExtra": [] if service else [material_ref(materials, sequence + 1, 0.5)],
        "observaciones": "Trabajo culminado en su totalidad, equipo probado operativo.",
        "fechaInicio": date_at(start_day),
        "horaInicio": "07:00",
        "fechaFin": date_at(end_day),
        "horaFin": f"{7 + int(hours):02d}:00" if hours < 12 else "19:00",
        "totalHoras": hours,
        "dateConsistencySnapshot": {"hasInconsistency": False, "count": 0},
        "maintenanceSuggestion": "",
    }
    if service:
        report.update({
            "serviceProviderId": "TER-1",
            "serviceProviderName": "Taller Casas SAC",
            "serviceCompany": "Taller Casas",
            "serviceActivity": "Alineamiento y correccion de vibracion por tercero.",
            "serviceCost": service_cost,
            "serviceAllInclusive": True,
            "observaciones": "Servicio externo ejecutado, pendiente conformidad economica." if service_cost <= 0 else "Servicio externo conforme con costo registrado.",
        })
    return report


def build_work_reports(active_ots: list[dict], rrhh: list[dict], materials: list[dict]) -> list[dict]:
    reports = []
    released = [item for item in active_ots if item["status_ot"] in {"Liberada", "Solicitud de cierre"}]
    for index, alert in enumerate(released, start=1):
        day = int(alert["fecha_ejecutar"][-2:])
        reports.append(work_report(
            alert,
            1,
            rrhh,
            materials,
            start_day=day,
            end_day=day,
            hours=6 + index,
            technicians=["MEC-1"] if index % 2 else ["ELE-1"],
            report_type="internal",
        ))
        if index == 2:
            reports[-1]["fechaInicio"] = date_at(day + 4)
            reports[-1]["dateConsistencySnapshot"] = {"hasInconsistency": True, "count": 1}
            reports[-1]["observaciones"] = "Registro fuera del rango liberado para probar indicador de inconsistencia."
        if index == 4:
            reports.append(work_report(
                alert,
                2,
                rrhh,
                materials,
                start_day=day,
                end_day=day + 1,
                hours=4,
                technicians=[],
                report_type="service",
                service_cost=0.0,
            ))
    return reports


def build_closed_history(equipment: list[dict], rrhh: list[dict], materials: list[dict], amef: list[dict]) -> list[dict]:
    history = []
    for index in range(1, 11):
        eq = equipment[(index - 1) % len(equipment)]
        ot_num = f"OT-{SIM_YEAR}-{index:06d}"
        personal = [staff_ref(rrhh, "MEC-1" if index % 2 else "ELE-1"), staff_ref(rrhh, "MEC-2" if index % 3 == 0 else "SOL-1")]
        mats = [material_ref(materials, index, 1), material_ref(materials, index + 2, 2)]
        mode = next((row for row in amef if row["equipo_codigo"] == eq["codigo"]), None)
        start_day = min(index + 1, 18)
        end_day = start_day if index % 3 else start_day + 1
        reports = [
            work_report(
                {
                    "id": f"closed_{index}",
                    "ot_numero": ot_num,
                    "fecha_ejecutar": date_at(start_day),
                },
                1,
                rrhh,
                materials,
                start_day=start_day,
                end_day=end_day,
                hours=5 + (index % 4),
                technicians=[personal[0]["codigo"]],
            )
        ]
        labor_cost = sum(float(p["costo_hora"]) * reports[0]["totalHoras"] for p in personal[:1])
        material_cost = sum(float(m["costo_unit"]) * float(m["cantidad"]) for m in mats)
        service_cost = 350.0 if index in {4, 9} else 0.0
        history.append({
            "id": f"ot_closed_{index}",
            "fecha_ejecutar": date_at(start_day),
            "fecha_programada": date_at(start_day),
            "codigo": eq["codigo"],
            "descripcion": eq["descripcion"],
            "area_trabajo": eq["area_trabajo"],
            "prioridad": eq["criticidad"],
            "actividad": "Correctivo planificado por hallazgo y cierre tecnico documentado.",
            "responsable": "Mecanicos",
            "status_ot": "Cerrada",
            "ot_numero": ot_num,
            "fecha_ejecucion": date_at(start_day),
            "tipo_mantto": "Correctivo" if index % 2 else "Preventivo",
            "personal_mantenimiento": ", ".join(f"{p['codigo']} - {p['nombres_apellidos']}" for p in personal),
            "materiales": ", ".join(f"{m['codigo']} x{m['cantidad']}" for m in mats),
            "personal_detalle": personal,
            "materiales_detalle": mats,
            "registro_ot": {
                "fecha_inicio": date_at(start_day),
                "fecha_fin": date_at(end_day),
                "hora_inicio": "07:00",
                "hora_fin": "18:00",
                "observaciones": "Liberada para intervencion de simulacion.",
                "fecha_liberacion": iso_at(start_day, 7, 20),
                "liberado_por": "Rosa Villanueva Encargada Electrica" if index % 2 else "Carlos Salazar Encargado Mecanico",
            },
            "fecha_emision_aviso": iso_at(max(1, start_day - 2), 8, 0),
            "fecha_aceptacion_aviso": iso_at(max(1, start_day - 1), 8, 30),
            "fecha_liberacion_ot": iso_at(start_day, 7, 20),
            "fecha_cierre": date_at(end_day),
            "fecha_ejecucion_real": date_at(end_day),
            "cierre_ot": {
                "tipo_mantenimiento": "Correctivo" if index % 2 else "Preventivo",
                "puesto_trabajo_resp": "Mecanicos",
                "fecha_inicio": date_at(start_day),
                "hora_inicio": "07:00",
                "fecha_fin": date_at(end_day),
                "hora_fin": "18:00",
                "tiempo_efectivo_hh": reports[0]["totalHoras"],
                "tiempo_indisponible_generico": 11 if end_day == start_day else 35,
                "tiempo_indisponible_operacional": 8 if end_day == start_day else 20,
                "tiempo_personal": [
                    {
                        "codigo": personal[0]["codigo"],
                        "nombres_apellidos": personal[0]["nombres_apellidos"],
                        "especialidad": personal[0]["especialidad"],
                        "horas": reports[0]["totalHoras"],
                        "costo_hora": personal[0]["costo_hora"],
                    }
                ],
                "estado_equipo": "Operativo",
                "satisfaccion": "Conforme",
                "componente_intervenido": mode["componente_nombre"] if mode else "Equipo completo",
                "modo_falla": mode["modo_falla"] if mode else "Ninguna",
                "causa_raiz": mode["causa_falla"] if mode else "Ninguna",
                "accion_correctiva": "Se corrigio condicion detectada, se probo equipo sin alarma.",
                "recomendacion_tecnica": "Monitorear en siguiente ronda y revisar reincidencia.",
                "observaciones": "Cierre tecnico conforme. Evidencias y costos revisados.",
                "costo_mano_obra": money(labor_cost),
                "costo_materiales_total": money(material_cost),
                "costo_servicios_total": money(service_cost),
                "costo_total_mantenimiento": money(labor_cost + material_cost + service_cost),
                "cierre_aprobado_por": "Ingrid Vargas Jefa Mantto",
                "cierre_aprobado_fecha": iso_at(end_day, 18, 30),
            },
            "reportes_trabajo": reports,
        })
    return history


def build_notices(equipment: list[dict]) -> list[dict]:
    statuses = ["Pendiente", "Pendiente", "Aceptado", "Rechazado", "Pendiente", "Aceptado", "Pendiente", "Rechazado", "Aceptado", "Pendiente"]
    categories = ["Aviso general", "Observacion mecanica", "Observacion electrica", "Riesgo de seguridad"]
    rows = []
    for index, eq in enumerate(equipment, start=1):
        critical = "Critica" if eq["criticidad"] == "Critica" else ("Alta" if index % 3 == 0 else "Media")
        rows.append({
            "id": f"notice_manual_{index}",
            "sequence": index,
            "aviso_codigo": f"AV-MAN-{index:04d}",
            "status": statuses[index - 1],
            "source_ot_id": "",
            "source_ot_numero": "",
            "source_report_id": "",
            "source_report_code": "",
            "codigo": eq["codigo"],
            "descripcion": eq["descripcion"],
            "area_trabajo": eq["area_trabajo"],
            "equipo_id": eq["id"],
            "categoria": categories[index % len(categories)],
            "detalle": f"Se detecta condicion anormal en {eq['descripcion']}: ruido, temperatura o vibracion fuera de patron.",
            "sugerencia_texto": "Revisar condicion y evaluar generacion de OT correctiva.",
            "hora_evidencia": f"{8 + index % 8:02d}:15",
            "evidencia_vista_at": iso_at(20, 9, index),
            "can_continue_working": critical != "Critica",
            "detection_method": "Visual" if index % 2 else "Ruido / tacto",
            "has_production_impact": critical in {"Alta", "Critica"},
            "has_safety_risk": critical == "Critica",
            "requires_stop": critical == "Critica",
            "criticidad_aviso": critical,
            "prioridad_sugerida": critical if critical != "Critica" else "Critica",
            "tipo_mantto_sugerido": "Correctivo",
            "resumen_criticidad": "Calculado por cuestionario de continuidad operativa, deteccion e impacto.",
            "rango_notificacion": "",
            "created_at": iso_at(18 + index % 3, 7, index),
            "created_by": "Kiara Tenorio Supervisora" if index % 2 else "Ruben Lopez Operador",
            "created_by_username": "sup_kt" if index % 2 else "ope_rl",
            "created_by_role": "SUPERVISOR" if index % 2 else "OPERADOR",
            "accepted_at": iso_at(20, 10, index) if statuses[index - 1] == "Aceptado" else "",
            "accepted_by_name": "Paolo Medina Planner" if statuses[index - 1] == "Aceptado" else "",
            "rejection_reason": "No se confirma condicion al inspeccionar equipo." if statuses[index - 1] == "Rechazado" else "",
        })
    return rows


def build_attendance(rrhh: list[dict], work_reports: list[dict]) -> list[dict]:
    own_people = [row for row in rrhh if row["tipo_personal"] == "Propio"]
    rows = []
    for day in range(15, 22):
        for person in own_people:
            status = "Asistencia total"
            assisted = float(person.get("disponibilidad_diaria_horas") or 12)
            if person["codigo"] == "SOL-1" and day == 18:
                status = "Asistencia parcial"
                assisted = 6.0
            if person["codigo"] == "OPR-1" and day == 19:
                status = "Vacaciones"
                assisted = 0.0
            rows.append({
                "id": f"{date_at(day)}_{person['id']}",
                "fecha": date_at(day),
                "personal_id": str(person["id"]),
                "personal_codigo": person["codigo"],
                "personal_nombre": person["nombres_apellidos"],
                "tipo_personal": person["tipo_personal"],
                "empresa": person["empresa"],
                "estado_asistencia": status,
                "turno": f"{person.get('hora_entrada') or '07:00'} - {person.get('hora_salida') or '19:00'}",
                "horas_programadas": float(person.get("disponibilidad_diaria_horas") or 12),
                "horas_asistidas": assisted,
                "observaciones": "Simulacion de asistencia diaria.",
                "registrado_por": "planner_sim",
                "registrado_at": iso_at(day, 6, 50),
            })

    # Caso intencional de control: un tecnico acumula mas horas reales por notificacion
    # que las horas asistidas registradas, para validar la alerta de asistencia.
    for report in work_reports:
        for tech in report.get("tecnicos", []):
            if tech.get("codigo") == "MEC-1" and report.get("fechaInicio") == date_at(15):
                report["totalHoras"] = 13
    return rows


def build_configurable_lists() -> list[dict]:
    return [
        {"key": "responsables", "label": "Responsables", "description": "Responsables habituales de planes, OTs y avisos.", "options": ["Mecanico", "Electricista", "Mecanicos", "Ingeniero", "Planner", "Terceros", "Operaciones"]},
        {"key": "areas_trabajo", "label": "Areas de trabajo", "description": "Areas productivas.", "options": ["Planta", "Secado", "Logistica", "Almacen", "Contabilidad", "Servicios"]},
        {"key": "tipos_mantenimiento", "label": "Tipos de mantenimiento", "description": "Tipos disponibles al crear o editar OT.", "options": ["Preventivo", "Correctivo", "Predictivo", "Inspeccion", "Lubricacion", "Mejora"]},
        {"key": "prioridades", "label": "Prioridades", "description": "Prioridades disponibles.", "options": ["Critica", "Alta", "Media", "Baja"]},
        {"key": "variaciones_control", "label": "Variaciones de control", "description": "Clasificaciones V.C.", "options": ["V.C - DIA", "V.C - HRA", "V.C - KM"]},
    ]


def build_pdf_settings() -> dict:
    return {
        "title": "ORDEN DE TRABAJO",
        "companyName": "EMPRESA ON - SITE MAINTENANCE",
        "documentSubtitle": "MANTENIMIENTO INDUSTRIAL",
        "primaryColor": "#ef4444",
        "headerColor": "#facc15",
        "sectionColor": "#64748b",
        "fontSize": 8,
        "titleFontSize": 14,
        "activityRows": 10,
        "materialRows": 10,
        "personRows": 6,
        "signatureLabels": ["TECNICO DE MANTENIMIENTO", "JEFE DE MANTENIMIENTO", "SUPERVISOR DE MANTENIMIENTO"],
    }


def build_audit(active_ots: list[dict], history: list[dict], notices: list[dict]) -> list[dict]:
    entries = []
    for item in active_ots:
        entries.append({
            "id": f"audit_{item['id']}",
            "createdAt": iso_at(21, 8, len(entries) % 50),
            "entityType": "OT",
            "entityId": item["id"],
            "title": f"OT {item.get('ot_numero') or item['codigo']} en estado {item['status_ot']}",
            "description": f"{item['descripcion']} | Area {item['area_trabajo']}",
            "severity": "warning" if item["status_ot"] == "Solicitud de cierre" else "info",
            "actor": {"username": "planner_sim", "role": "PLANNER"},
            "after": {"status_ot": item["status_ot"], "ot_numero": item.get("ot_numero", "")},
        })
    for item in history[:5]:
        entries.append({
            "id": f"audit_{item['id']}",
            "createdAt": item["cierre_ot"]["cierre_aprobado_fecha"],
            "entityType": "OT",
            "entityId": item["id"],
            "title": f"OT {item['ot_numero']} cerrada",
            "description": f"Modo de falla: {item['cierre_ot']['modo_falla']} | Costo total S/ {item['cierre_ot']['costo_total_mantenimiento']}",
            "severity": "success",
            "actor": {"username": "ing_sim", "role": "INGENIERO"},
            "after": {"status_ot": "Cerrada"},
        })
    for item in notices:
        entries.append({
            "id": f"audit_{item['id']}",
            "createdAt": item["created_at"],
            "entityType": "Aviso",
            "entityId": item["id"],
            "title": f"Aviso {item['aviso_codigo']} registrado",
            "description": f"{item['codigo']} - {item['criticidad_aviso']} - {item['status']}",
            "severity": "critical" if item["criticidad_aviso"] == "Critica" else "info",
            "actor": {"username": item["created_by_username"], "role": item["created_by_role"]},
            "after": {"status": item["status"], "criticidad_aviso": item["criticidad_aviso"]},
        })
    return entries


def build_documents() -> dict[str, object]:
    rrhh = build_rrhh()
    equipment = build_equipment()
    materials = build_materials()
    packages = build_packages()
    plans = build_date_plans(equipment, packages)
    km_plans, counter_history = build_km_plans(equipment, packages)
    amef = build_amef(equipment)
    active_ots = build_active_ots(equipment, materials, rrhh)
    work_reports = build_work_reports(active_ots, rrhh, materials)
    attendance = build_attendance(rrhh, work_reports)
    history = build_closed_history(equipment, rrhh, materials, amef)
    notices = build_notices(equipment)

    return {
        SHARED_DOCUMENT_KEYS["rrhh"]: rrhh,
        SHARED_DOCUMENT_KEYS["rrhhAttendance"]: attendance,
        SHARED_DOCUMENT_KEYS["configurableLists"]: build_configurable_lists(),
        SHARED_DOCUMENT_KEYS["materials"]: materials,
        SHARED_DOCUMENT_KEYS["equipmentColumns"]: build_equipment_columns(),
        SHARED_DOCUMENT_KEYS["equipmentItems"]: equipment,
        SHARED_DOCUMENT_KEYS["equipmentExchangeHistory"]: [
            {
                "id": "exchange_sim_1",
                "fecha": iso_at(18, 14, 0),
                "sourceEquipo": "IAISPL1",
                "targetEquipo": "IAISPL2",
                "nodeName": "Motor principal",
                "oldCode": "IAISPL1-1",
                "newCode": "IAISPL1-1",
                "levelsMigrated": 2,
            }
        ],
        SHARED_DOCUMENT_KEYS["amef"]: amef,
        SHARED_DOCUMENT_KEYS["maintenancePlans"]: plans,
        SHARED_DOCUMENT_KEYS["maintenancePlansKm"]: km_plans,
        SHARED_DOCUMENT_KEYS["maintenanceCountersHistory"]: counter_history,
        SHARED_DOCUMENT_KEYS["maintenancePackages"]: packages,
        SHARED_DOCUMENT_KEYS["maintenanceNotices"]: notices,
        SHARED_DOCUMENT_KEYS["executiveAudit"]: build_audit(active_ots, history, notices),
        SHARED_DOCUMENT_KEYS["otAlerts"]: active_ots,
        SHARED_DOCUMENT_KEYS["otDeleted"]: [
            {
                "id": "deleted_ot_sim_1",
                "codigo": "IAISC1",
                "descripcion": "Secadora Sabreca N 1",
                "fecha_eliminacion": iso_at(19, 15, 0),
                "motivo": "Duplicada por carga de prueba.",
            }
        ],
        SHARED_DOCUMENT_KEYS["otSequenceSettings"]: [{"year": SIM_YEAR, "start_number": 1, "last_number": 14}],
        SHARED_DOCUMENT_KEYS["otHistory"]: history,
        SHARED_DOCUMENT_KEYS["otWorkReports"]: work_reports,
        SHARED_DOCUMENT_KEYS["otPdfFormat"]: build_pdf_settings(),
        SHARED_DOCUMENT_KEYS["bajasHistory"]: [
            {
                "id": "baja_sim_1",
                "codigo": "SENSOR-OLD",
                "descripcion": "Sensor inductivo retirado",
                "fecha": date_at(11),
                "motivo": "Obsoleto por reemplazo tecnologico.",
                "registrado_por": "ing_sim",
            }
        ],
    }


def validate_documents(documents: dict[str, object]) -> list[str]:
    findings: list[str] = []
    active_ots = documents[SHARED_DOCUMENT_KEYS["otAlerts"]]
    history = documents[SHARED_DOCUMENT_KEYS["otHistory"]]
    reports = documents[SHARED_DOCUMENT_KEYS["otWorkReports"]]
    equipment = documents[SHARED_DOCUMENT_KEYS["equipmentItems"]]
    plans = documents[SHARED_DOCUMENT_KEYS["maintenancePlans"]]
    notices = documents[SHARED_DOCUMENT_KEYS["maintenanceNotices"]]

    if len([row for row in documents[SHARED_DOCUMENT_KEYS["rrhh"]] if row["cargo"] == "Tecnico"]) < 5:
        findings.append("RRHH: faltan 5 tecnicos propios.")
    if len(equipment) != 10:
        findings.append("Equipos: se esperaban 10 equipos cargados.")
    if len(plans) < len(equipment):
        findings.append("PMP Fechas: hay equipos sin cronograma por fecha.")
    if len(active_ots) != 10:
        findings.append("Gestion OT: se esperaban 10 OT activas entre pendientes/liberadas.")
    if len(history) != 10:
        findings.append("Historial OT: se esperaban 10 OT cerradas.")

    numbered_pending = [row for row in active_ots if row["status_ot"] in {"Pendiente", "Creada"} and row.get("ot_numero")]
    if numbered_pending:
        findings.append(f"Numeracion OT: {len(numbered_pending)} OT pendiente/creada tiene numero antes de liberarse.")
    released_without_number = [row for row in active_ots if row["status_ot"] in {"Liberada", "Solicitud de cierre"} and not row.get("ot_numero")]
    if released_without_number:
        findings.append(f"Numeracion OT: {len(released_without_number)} OT liberada no tiene numero.")

    missing_failure_mode = [row for row in history if not row.get("cierre_ot", {}).get("modo_falla")]
    if missing_failure_mode:
        findings.append(f"Cierre tecnico: {len(missing_failure_mode)} OT cerradas sin modo de falla.")

    service_without_cost = [
        report for report in reports
        if report.get("reportType") == "service" and float(report.get("serviceCost") or 0) <= 0
    ]
    if service_without_cost:
        findings.append(
            f"Cierre OT: {len(service_without_cost)} notificacion(es) de servicio no tienen costo; deben bloquear el cierre."
        )

    inconsistent_reports = [
        report for report in reports
        if report.get("dateConsistencySnapshot", {}).get("hasInconsistency")
    ]
    if inconsistent_reports:
        findings.append(
            f"Notificaciones: {len(inconsistent_reports)} registro(s) tienen inconsistencia de fecha; deben quedar visibles."
        )

    accepted_notices = [item for item in notices if item.get("status") == "Aceptado"]
    if not accepted_notices:
        findings.append("Avisos: no hay avisos aceptados para probar conversion a OT.")

    return findings


def build_simulation_report(db_path: Path, documents: dict[str, object], findings: list[str]) -> str:
    active_ots = documents[SHARED_DOCUMENT_KEYS["otAlerts"]]
    history = documents[SHARED_DOCUMENT_KEYS["otHistory"]]
    rrhh = documents[SHARED_DOCUMENT_KEYS["rrhh"]]
    materials = documents[SHARED_DOCUMENT_KEYS["materials"]]
    notices = documents[SHARED_DOCUMENT_KEYS["maintenanceNotices"]]
    reports = documents[SHARED_DOCUMENT_KEYS["otWorkReports"]]

    role_counts = {}
    for user in build_users():
        role_counts[user["role"]] = role_counts.get(user["role"], 0) + 1

    active_by_status = {}
    for item in active_ots:
        active_by_status[item["status_ot"]] = active_by_status.get(item["status_ot"], 0) + 1

    report_lines = [
        "# Simulacion integral multirol de mantenimiento",
        "",
        f"- Base aislada: `{db_path}`",
        f"- Fecha de referencia: `{BASE_DATE.date().isoformat()}`",
        f"- Clave comun de usuarios simulados: `{SIM_PASSWORD}`",
        "",
        "## Usuarios simulados",
        "",
    ]
    for user in build_users():
        report_lines.append(f"- `{user['username']}` / `{SIM_PASSWORD}` / {user['role']} / {user['full_name']}")

    report_lines.extend([
        "",
        "## Datos cargados",
        "",
        f"- RRHH: {len(rrhh)} registros, incluyendo 5 tecnicos propios, 2 encargados y 2 terceros.",
        f"- Equipos: {len(documents[SHARED_DOCUMENT_KEYS['equipmentItems']])} equipos con despiece para AMEF.",
        f"- Paquetes PM: {len(documents[SHARED_DOCUMENT_KEYS['maintenancePackages']])}.",
        f"- Cronogramas por fecha: {len(documents[SHARED_DOCUMENT_KEYS['maintenancePlans']])}.",
        f"- Planes Km/Hr: {len(documents[SHARED_DOCUMENT_KEYS['maintenancePlansKm']])}.",
        f"- Materiales: {len(materials)} con stock y costo unitario.",
        f"- OT activas: {len(active_ots)} ({', '.join(f'{k}: {v}' for k, v in sorted(active_by_status.items()))}).",
        f"- OT cerradas historicas: {len(history)}.",
        f"- Notificaciones de trabajo activas: {len(reports)}.",
        f"- Avisos de mantenimiento: {len(notices)}.",
        f"- Registros AMEF: {len(documents[SHARED_DOCUMENT_KEYS['amef']])}.",
        "",
        "## Flujos simulados",
        "",
        "- Ingeniero: revisa AMEF, costos historicos, cierre tecnico y PDF de OT cerradas.",
        "- Planner: revisa itinerario, asistencia, avisos, cronograma y contadores Km/Hr.",
        "- Encargados: crean, reprograman, liberan y solicitan cierre de OT.",
        "- Tecnicos: registran notificaciones de trabajo con materiales y horas.",
        "- Supervisor/Operador: crean avisos de mantenimiento y consultan historial.",
        "",
        "## Hallazgos detectados",
        "",
    ])

    if findings:
        report_lines.extend([f"- {finding}" for finding in findings])
    else:
        report_lines.append("- No se detectaron inconsistencias de datos en la carga inicial.")

    report_lines.extend([
        "",
        "## Riesgos funcionales que conviene abordar",
        "",
        "- Concurrencia: varios modulos guardan documentos completos con PUT. Si dos usuarios editan al mismo tiempo el mismo documento, el ultimo guardado puede pisar cambios del primero. Recomendacion: agregar version/updated_at por documento u operaciones PATCH por entidad.",
        "- Numeracion OT: la numeracion correlativa sigue dependiendo de lectura y escritura de un documento compartido. En uso simultaneo real, dos liberaciones al mismo tiempo podrian solicitar el mismo siguiente numero. Recomendacion: endpoint transaccional backend para asignar numero OT.",
        "- Stock: la reserva/consumo de materiales tambien se calcula desde documentos completos. Recomendacion: endpoint transaccional para notificacion de trabajo + descuento/reversion de stock.",
        "- Configuracion: en PostgreSQL se necesitaba `settings.value` como TEXT para soportar JSON grande. Esta simulacion deja preparado el modelo y migracion.",
        "",
        "## Como usar la base simulada",
        "",
        "En PowerShell, para arrancar backend contra esta base:",
        "",
        "```powershell",
        f"$env:DATABASE_URL='sqlite+aiosqlite:///{db_path.as_posix()}'",
        "cd backend",
        "uvicorn api:app --reload",
        "```",
        "",
        "Luego inicia el frontend normalmente y entra con cualquiera de los usuarios simulados.",
        "",
    ])
    return "\n".join(report_lines)


def prepare_db_path(db_path: Path, overwrite: bool) -> Path:
    if overwrite:
        try:
            for suffix in ("", "-journal", "-wal", "-shm"):
                candidate = Path(f"{db_path}{suffix}")
                if candidate.exists():
                    candidate.unlink()
        except PermissionError:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            return db_path.with_name(f"{db_path.stem}_{timestamp}{db_path.suffix}")
    return db_path


async def seed_database(db_path: Path, overwrite: bool) -> tuple[dict[str, object], Path]:
    db_path = prepare_db_path(db_path, overwrite)

    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path.as_posix()}"
    os.environ["SQLITE_SIMULATION_NO_JOURNAL"] = "1"

    from sqlalchemy import delete, select

    from auth import hash_password
    from db import SessionLocal, init_db
    from models import AccountStatus, Role, Setting, User

    await init_db()
    documents = build_documents()

    async with SessionLocal() as session:
        for user_data in build_users():
            existing = (
                await session.execute(select(User).where(User.username == user_data["username"]))
            ).scalar_one_or_none()
            role = Role[user_data["role"]].value
            if existing:
                existing.full_name = user_data["full_name"]
                existing.role = role
                existing.account_status = AccountStatus.ACTIVE.value
                existing.password_hash = hash_password(SIM_PASSWORD)
            else:
                session.add(User(
                    username=user_data["username"],
                    full_name=user_data["full_name"],
                    role=role,
                    account_status=AccountStatus.ACTIVE.value,
                    password_hash=hash_password(SIM_PASSWORD),
                ))

        await session.execute(delete(Setting).where(Setting.key.in_(list(documents.keys()))))
        for key, value in documents.items():
            session.add(Setting(key=key, value=json.dumps(value, ensure_ascii=False)))

        await session.commit()

    return documents, db_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crea una base aislada de simulacion integral de mantenimiento.")
    parser.add_argument(
        "--db",
        default=str(BACKEND_DIR / "simulation_maintenance.sqlite3"),
        help="Ruta del archivo SQLite de simulacion.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Elimina y recrea la base de simulacion si ya existe.",
    )
    parser.add_argument(
        "--report",
        default=str(ROOT_DIR / "SIMULACION_MANTENIMIENTO.md"),
        help="Ruta del reporte Markdown de resultados.",
    )
    return parser.parse_args()


async def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = parse_args()
    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    documents, db_path = await seed_database(db_path, overwrite=args.overwrite)
    findings = validate_documents(documents)
    report = build_simulation_report(db_path, documents, findings)

    report_path = Path(args.report).resolve()
    report_path.write_text(report, encoding="utf-8")

    summary = {
        "database": str(db_path),
        "report": str(report_path),
        "users": len(build_users()),
        "rrhh": len(documents[SHARED_DOCUMENT_KEYS["rrhh"]]),
        "equipment": len(documents[SHARED_DOCUMENT_KEYS["equipmentItems"]]),
        "active_ots": len(documents[SHARED_DOCUMENT_KEYS["otAlerts"]]),
        "closed_ots": len(documents[SHARED_DOCUMENT_KEYS["otHistory"]]),
        "findings": findings,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
