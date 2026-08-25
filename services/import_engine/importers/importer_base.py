"""
SIGA — Importers Base & Specialized Domain Modules
Estrutura modular de importadores de domínio para o SIGA.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple
from services.import_engine.engine import ImportEngine, RowValidationResult


class BaseImporter(ABC):
    """Classe base abstrata compartilhada por todos os importadores especializados."""

    module_name: str = "base"
    target_table: str = ""

    def __init__(self, school_id: str, academic_year_id: str | None = None):
        self.school_id = school_id
        self.academic_year_id = academic_year_id

    @abstractmethod
    def validate_row(
        self,
        row_number: int,
        raw_row: Dict[str, Any],
        column_mapping: Dict[str, str],
        existing_records: List[Dict[str, Any]],
    ) -> RowValidationResult:
        """Valida uma linha do staging contra as regras de negócio do módulo."""
        pass

    @abstractmethod
    def build_insert_payload(
        self, normalized_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Prepara o payload oficial para inserção na tabela oficial do Supabase."""
        pass


class PeopleImporter(BaseImporter):
    module_name = "pessoas"
    target_table = "people"

    def validate_row(
        self,
        row_number: int,
        raw_row: Dict[str, Any],
        column_mapping: Dict[str, str],
        existing_records: List[Dict[str, Any]],
    ) -> RowValidationResult:
        mapped = {}
        for src_col, target_field in column_mapping.items():
            if src_col in raw_row and target_field:
                mapped[target_field] = str(raw_row[src_col]).strip()

        errors = []
        warnings = []
        full_name = mapped.get("full_name") or mapped.get("nome") or ""

        if not full_name:
            errors.append("Nome completo é obrigatório.")

        # Deteção de duplicados com pontuação de similaridade
        best_match_id = None
        best_score = 0.0
        for record in existing_records:
            score = ImportEngine.calculate_person_match_score(mapped, record)
            if score > best_score:
                best_score = score
                best_match_id = record.get("id")

        status = "valid"
        if errors:
            status = "error"
        elif best_score >= 0.85:
            status = "duplicate"
            warnings.append(f"Possível duplicado encontrado no SIGA ({int(best_score * 100)}% de correspondência).")
        elif best_score >= 0.60:
            status = "warning"
            warnings.append(f"Registo similar encontrado no SIGA ({int(best_score * 100)}% de correspondência).")

        return RowValidationResult(
            row_number=row_number,
            raw_data=raw_row,
            normalized_data=mapped,
            status=status,
            warnings=warnings,
            errors=errors,
            duplicate_of=best_match_id if best_score >= 0.85 else None,
            duplicate_score=best_score,
            suggested_action="update" if best_score >= 0.85 else "insert",
        )

    def build_insert_payload(self, normalized_data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "school_id": self.school_id,
            "full_name": normalized_data.get("full_name") or normalized_data.get("nome"),
            "id_number": normalized_data.get("id_number") or normalized_data.get("bi"),
            "gender": normalized_data.get("gender") or normalized_data.get("genero"),
            "birth_date": normalized_data.get("birth_date") or normalized_data.get("data_nascimento"),
            "phone": normalized_data.get("phone") or normalized_data.get("telefone"),
            "email": normalized_data.get("email"),
            "address": normalized_data.get("address") or normalized_data.get("morada"),
        }


class StudentImporter(PeopleImporter):
    module_name = "alunos"
    target_table = "students"


class EnrollmentImporter(BaseImporter):
    module_name = "matriculas"
    target_table = "enrollments"

    def validate_row(
        self,
        row_number: int,
        raw_row: Dict[str, Any],
        column_mapping: Dict[str, str],
        existing_records: List[Dict[str, Any]],
    ) -> RowValidationResult:
        mapped = {target: str(raw_row[src]).strip() for src, target in column_mapping.items() if src in raw_row}
        errors = []
        warnings = []

        if not mapped.get("student_id") and not mapped.get("aluno") and not mapped.get("n_processo"):
            errors.append("Identificador do aluno (Nome, BI ou Nº de Processo) é obrigatório.")
        if not mapped.get("class_group_id") and not mapped.get("turma"):
            errors.append("Identificação da Turma é obrigatória.")

        return RowValidationResult(
            row_number=row_number,
            raw_data=raw_row,
            normalized_data=mapped,
            status="error" if errors else "valid",
            warnings=warnings,
            errors=errors,
        )

    def build_insert_payload(self, normalized_data: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "school_id": self.school_id,
            "academic_year_id": self.academic_year_id,
            "student_id": normalized_data.get("student_id"),
            "class_group_id": normalized_data.get("class_group_id"),
            "status": normalized_data.get("status", "active"),
        }


# Mapeamento de Ordem de Dependência das Importações
DEPENDENCY_EXECUTION_ORDER: List[str] = [
    "pessoas",
    "professores",
    "funcionarios",
    "encarregados",
    "alunos",
    "cursos",
    "classes",
    "salas",
    "turmas",
    "disciplinas",
    "matriculas",
    "inscricoes",
    "horarios",
    "avaliacoes",
    "notas",
    "presencas",
    "propinas",
    "pagamentos",
    "dividas",
]
