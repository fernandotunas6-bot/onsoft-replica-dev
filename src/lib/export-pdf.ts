import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PdfValue = string | number | boolean | null | undefined;

export function exportPdfTable<Row extends object>(
  filename: string,
  title: string,
  columns: ReadonlyArray<{ label: string; value: (row: Row) => PdfValue }>,
  rows: ReadonlyArray<Row>,
  subtitle?: string,
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(subtitle, 14, 23);
    doc.setTextColor(0);
  }

  autoTable(doc, {
    startY: subtitle ? 28 : 22,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) =>
      columns.map((column) => {
        const value = column.value(row);
        return value == null ? "" : String(value);
      }),
    ),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 120] },
  });

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export type OfficialPautaMeta = {
  schoolName: string;
  academicYear: string;
  gradeName?: string | undefined;
  courseName?: string | undefined;
  className?: string | undefined;
  subjectName?: string | undefined;
  termLabel?: string | undefined;
  province?: string | undefined;
  municipality?: string | undefined;
  issuedOn?: string | undefined;
  directorName?: string | undefined;
  validationCode?: string | undefined;
};

let emblemDataUrlPromise: Promise<string | null> | undefined;

/** Rasteriza o brasão oficial (SVG) para PNG uma única vez, em cache, para uso em jsPDF.addImage. */
function loadEmblemDataUrl(): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  emblemDataUrlPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = "/brands/emblem-angola.svg";
  });
  return emblemDataUrlPromise;
}

function drawFallbackEmblem(doc: InstanceType<typeof jsPDF>, pageWidth: number) {
  doc.setFillColor(206, 17, 38);
  doc.circle(pageWidth / 2, 18, 8, "F");
  doc.setFillColor(255, 205, 0);
  doc.circle(pageWidth / 2, 18, 4, "F");
}

async function drawOfficialHeader(
  doc: InstanceType<typeof jsPDF>,
  meta: OfficialPautaMeta,
  title: string,
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const emblemDataUrl = await loadEmblemDataUrl();
  if (emblemDataUrl) {
    doc.addImage(emblemDataUrl, "PNG", pageWidth / 2 - 10, 6, 20, 20);
  } else {
    drawFallbackEmblem(doc, pageWidth);
  }
  doc.setTextColor(0);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  doc.text("REPÚBLICA DE ANGOLA", pageWidth / 2, 32, { align: "center" });
  doc.setFontSize(10);
  doc.text("MINISTÉRIO DA EDUCAÇÃO", pageWidth / 2, 38, { align: "center" });
  doc.setFontSize(13);
  doc.text(meta.schoolName.toUpperCase(), pageWidth / 2, 46, { align: "center" });
  doc.setFontSize(12);
  doc.text(title.toUpperCase(), pageWidth / 2, 54, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const details = [
    meta.province || meta.municipality
      ? `${meta.province ?? ""}${meta.province && meta.municipality ? " · " : ""}${meta.municipality ?? ""}`
      : "",
    `Ano Lectivo: ${meta.academicYear}`,
    meta.gradeName ? `Classe: ${meta.gradeName}` : "",
    meta.courseName ? `Curso: ${meta.courseName}` : "",
    meta.className ? `Turma: ${meta.className}` : "",
    meta.subjectName ? `Disciplina: ${meta.subjectName}` : "",
    meta.termLabel ? `Trimestre: ${meta.termLabel}` : "",
    `Data: ${meta.issuedOn ?? new Date().toLocaleDateString("pt-AO")}`,
  ].filter(Boolean);
  doc.text(details.join("   "), pageWidth / 2, 61, { align: "center", maxWidth: pageWidth - 28 });
  return 68;
}

export async function exportOfficialPautaPdf<Row extends object>(
  filename: string,
  title: string,
  meta: OfficialPautaMeta,
  columns: ReadonlyArray<{ label: string; value: (row: Row) => PdfValue }>,
  rows: ReadonlyArray<Row>,
) {
  const doc = new jsPDF({ orientation: columns.length > 7 ? "landscape" : "portrait" });
  const startY = await drawOfficialHeader(doc, meta, title);
  autoTable(doc, {
    startY,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) =>
      columns.map((column) => {
        const value = column.value(row);
        return value == null ? "—" : String(value);
      }),
    ),
    styles: { fontSize: 8, cellPadding: 2, font: "times" },
    headStyles: { fillColor: [206, 17, 38], textColor: 255 },
  });
  const finalY =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  const pageHeight = doc.internal.pageSize.getHeight();
  const signaturesY = Math.min(finalY + 22, pageHeight - 24);
  doc.setFontSize(9);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.text("O Professor: ____________________", 14, signaturesY);
  doc.text("O Coordenador: ____________________", pageWidth / 2, signaturesY, { align: "center" });
  doc.text("A Direcção: ____________________", pageWidth - 14, signaturesY, { align: "right" });
  if (meta.directorName) {
    doc.setFontSize(8);
    doc.text(meta.directorName, pageWidth - 14, signaturesY + 6, { align: "right" });
  }
  if (meta.validationCode) {
    const boxX = pageWidth - 42;
    const boxY = 8;
    doc.setDrawColor(30, 30, 30);
    doc.rect(boxX, boxY, 28, 28);
    doc.setFillColor(20, 20, 20);
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1) {
        const on =
          (meta.validationCode.charCodeAt((row + col) % meta.validationCode.length) + row * col) %
            3 ===
          0;
        if (on) doc.rect(boxX + 2 + col * 4, boxY + 2 + row * 4, 3.2, 3.2, "F");
      }
    }
    doc.setFontSize(6);
    doc.text(meta.validationCode, boxX + 14, boxY + 32, { align: "center" });
  }
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

export async function exportOfficialDeclarationPdf(
  filename: string,
  title: string,
  meta: OfficialPautaMeta & {
    studentName: string;
    registrationNumber: string;
    body: string;
  },
) {
  const doc = new jsPDF({ orientation: "portrait" });
  const startY = await drawOfficialHeader(doc, meta, title);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFont("times", "normal");
  doc.setFontSize(12);
  doc.text(meta.body, 18, startY + 10, { maxWidth: pageWidth - 36, align: "justify" });
  doc.setFontSize(10);
  doc.text(`Aluno: ${meta.studentName}`, 18, startY + 52);
  doc.text(`Processo: ${meta.registrationNumber}`, 18, startY + 58);
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(9);
  doc.text("A Direcção: ____________________", pageWidth - 18, pageHeight - 36, {
    align: "right",
  });
  if (meta.directorName) {
    doc.setFontSize(8);
    doc.text(meta.directorName, pageWidth - 18, pageHeight - 30, { align: "right" });
  }
  if (meta.validationCode) {
    doc.setFontSize(8);
    doc.setFont("courier", "normal");
    doc.text(`Validar: ${meta.validationCode}`, 18, pageHeight - 18);
  }
  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}
