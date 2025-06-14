import type { ContractParagraph } from "@shared/schema";

export async function exportToDocx(paragraphs: ContractParagraph[]) {
  try {
    // Dynamic import of docx to avoid bundling issues
    const { Document, Packer, Paragraph, TextRun, BorderStyle } = await import("docx");

    const docxParagraphs = paragraphs.map((paragraph) => {
      const backgroundColor = paragraph.category === 'checklist' 
        ? 'E6FFE6' 
        : paragraph.category === 'partial'
        ? 'FFF3CD'
        : paragraph.category === 'risk' 
        ? 'FFE6E6' 
        : paragraph.category === 'missing'
        ? 'FFE6CC'
        : paragraph.category === 'other'
        ? 'FFF2CC'
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
              ? '00AA00' 
              : paragraph.category === 'partial'
              ? 'FFAA00'
              : paragraph.category === 'risk' 
              ? 'CC0000' 
              : paragraph.category === 'missing'
              ? 'FF8800'
              : paragraph.category === 'other'
              ? 'CCAA00'
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
