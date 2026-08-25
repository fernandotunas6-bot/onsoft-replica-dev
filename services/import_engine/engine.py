"""
SIGA — Motor Central de Importação de Dados Escolares
Engine em Python para parsing pesado de Excel/CSV, normalização,
deteção inteligente de duplicados (Fuzzy Matching) e geração de relatórios de erros.
"""

from dataclasses import dataclass, field
import io
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


def normalize_string_for_comparison(text: str) -> str:
    """Normaliza acentos, espaços e maiúsculas para comparação sem alterar a string armazenada."""
    if not text:
        return ""
    # Strip e lowercase
    cleaned = text.strip().lower()
    # Remove acentos para comparação
    nfkd = unicodedata.normalize("NFKD", cleaned)
    no_accents = "".join([c for c in nfkd if not unicodedata.combining(c)])
    # Remove pontuação extra e múltiplos espaços
    no_accents = re.sub(r"\s+", " ", no_accents)
    return no_accents


def normalize_angola_phone(phone_raw: str) -> str:
    """Normaliza número de telefone de Angola (E.164 ou 9 números)."""
    if not phone_raw:
        return ""
    digits = re.sub(r"\D", "", str(phone_raw))
    if len(digits) == 9 and digits.startswith("9"):
        return f"+244{digits}"
    if len(digits) == 12 and digits.startswith("2449"):
        return f"+{digits}"
    return phone_raw.strip()


def normalize_document_bi(doc_raw: str) -> str:
    """Normaliza formato de Bilhete de Identidade de Angola (ex.: 000000000LA000)."""
    if not doc_raw:
        return ""
    cleaned = str(doc_raw).strip().upper().replace(" ", "").replace("-", "")
    return cleaned


@dataclass
class ColumnMapping:
    source_column: str
    target_field: str
    confidence: float = 1.0


@dataclass
class SheetAnalysis:
    sheet_name: str
    total_rows: int
    headers: List[str]
    suggested_module: str
    confidence: float


@dataclass
class RowValidationResult:
    row_number: int
    raw_data: Dict[str, Any]
    normalized_data: Dict[str, Any]
    status: str  # valid, warning, error, duplicate, will_update, will_insert
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    duplicate_of: Optional[str] = None
    duplicate_score: float = 0.0
    suggested_action: str = "insert"  # insert, update, ignore, merge


class ImportEngine:
    """
    Núcleo do Motor de Importação do SIGA.
    """

    MODULE_HEADER_SIGNATURES: Dict[str, List[str]] = {
        "alunos": ["nome", "bi", "cedula", "data nascimento", "encarregado", "classe", "turma", "nº processo"],
        "pessoas": ["nome", "bi", "nif", "telefone", "email", "genero", "sexo", "morada", "endereco"],
        "professores": ["professor", "docente", "disciplina", "turma", "especialidade", "grau"],
        "turmas": ["turma", "classe", "curso", "sala", "ano lectivo", "turno", "vagas"],
        "matriculas": ["aluno", "nº processo", "turma", "classe", "ano lectivo", "data matricula"],
        "notas": ["aluno", "turma", "disciplina", "periodo", "mac", "npp", "npt", "nota"],
        "pagamentos": ["aluno", "valor", "mes", "referencia", "emissao", "vencimento", "estado"],
    }

    @classmethod
    def infer_module_from_headers(cls, headers: List[str]) -> Tuple[str, float]:
        """Infere o módulo candidato com base nos cabeçalhos presentes na folha de cálculo."""
        normalized_headers = [normalize_string_for_comparison(h) for h in headers if h]
        best_module = "pessoas"
        best_score = 0.0

        for module, keywords in cls.MODULE_HEADER_SIGNATURES.items():
            matches = 0
            for kw in keywords:
                if any(kw in h for h in normalized_headers):
                    matches += 1
            score = matches / len(keywords) if keywords else 0.0
            if score > best_score:
                best_score = score
                best_module = module

        return best_module, round(best_score, 2)

    @classmethod
    def calculate_person_match_score(
        cls, candidate: Dict[str, Any], existing: Dict[str, Any]
    ) -> float:
        """
        Calcula pontuação de similaridade entre um registo candidato do Excel e um registo existente no SIGA.
        Combina BI (peso 100%), Nome + Data Nasc (peso 85%), Telefone (peso 50%).
        """
        # BI match (oficial)
        cand_bi = normalize_document_bi(candidate.get("bi") or candidate.get("id_number") or candidate.get("documento") or "")
        exist_bi = normalize_document_bi(existing.get("bi") or existing.get("id_number") or existing.get("documento") or "")
        if cand_bi and exist_bi and cand_bi == exist_bi:
            return 1.0

        score = 0.0
        # Nome match
        cand_name = normalize_string_for_comparison(candidate.get("full_name") or candidate.get("nome") or candidate.get("name") or "")
        exist_name = normalize_string_for_comparison(existing.get("full_name") or existing.get("nome") or existing.get("name") or "")

        if cand_name and exist_name:
            if cand_name == exist_name:
                score += 0.60
            elif cand_name in exist_name or exist_name in cand_name:
                score += 0.45

        # Data de Nascimento
        cand_dob = str(candidate.get("birth_date") or candidate.get("data_nascimento") or candidate.get("nascimento") or "").strip()
        exist_dob = str(existing.get("birth_date") or existing.get("data_nascimento") or existing.get("nascimento") or "").strip()
        if cand_dob and exist_dob and cand_dob == exist_dob:
            score += 0.35

        # Telefone
        cand_phone = normalize_angola_phone(candidate.get("phone") or candidate.get("telefone") or "")
        exist_phone = normalize_angola_phone(existing.get("phone") or existing.get("telefone") or "")
        if cand_phone and exist_phone and cand_phone == exist_phone:
            score += 0.15

        return min(round(score, 2), 0.99)
