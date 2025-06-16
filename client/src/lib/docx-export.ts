import type { ContractParagraph } from "@shared/schema";

export async function exportToDocx(paragraphs: ContractParagraph[]) {
  try {
    // Dynamic import of docx to avoid bundling issues
    const { Document, Packer, Paragraph, TextRun, BorderStyle } = await import("docx");

    const docxParagraphs = paragraphs.map((paragraph) => {
      const backgroundColor = paragraph.category === 'checklist' 
        ? 'DCFCE7' 
        : paragraph.category === 'partial'
        ? 'FEF3C7'
        : paragraph.category === 'risk' 
        ? 'FEE2E2' 
        : paragraph.category === 'missing'
        ? 'FDF2F8'
        : paragraph.category === 'other' || paragraph.category === 'ambiguous'
        ? 'E0E7FF'
        : 'FFFFFF';

      return new Paragraph({
        children: [
          new TextRun({
            text: paragraph.text,
            font: "Consolas",
            size: 20,
          }),
          ...(paragraph.comment ? [
            new TextRun({
              text: `\n[AI Comment: ${paragraph.comment}]`,
              font: "Arial",
              size: 18,
              italics: true,
              color: "666666",
            }),
          ] : []),
        ],
        shading: {
          fill: backgroundColor,
        },
        spacing: {
          after: 200,
        },
        border: {
          left: {
            style: BorderStyle.SINGLE,
            size: 6,
            color: paragraph.category === 'checklist' 
              ? '16A34A' 
              : paragraph.category === 'partial'
              ? 'D97706'
              : paragraph.category === 'risk' 
              ? 'DC2626' 
              : paragraph.category === 'missing'
              ? 'EC4899'
              : paragraph.category === 'other' || paragraph.category === 'ambiguous'
              ? '6366F1'
              : '666666',
          },
        },
      });
    });

    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "Contract Analysis Report",
                  bold: true,
                  size: 32,
                }),
              ],
              spacing: {
                after: 400,
              },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Generated on: ${new Date().toLocaleDateString()}`,
                  size: 20,
                  color: "666666",
                }),
              ],
              spacing: {
                after: 600,
              },
            }),
            ...docxParagraphs,
          ],
        },
      ],
    });

    const buffer = await Packer.toBlob(doc);
    
    // Create download link
    const url = URL.createObjectURL(buffer);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contract-analysis-${Date.now()}.docx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

  } catch (error) {
    console.error("Error exporting to DOCX:", error);
    throw new Error("Failed to export document");
  }
}
