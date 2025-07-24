import type { ContractParagraph, Contradiction, RightsImbalance, StructuralAnalysis } from "@shared/schema";

interface ExportData {
  contractParagraphs: ContractParagraph[];
  missingRequirements?: ContractParagraph[];
  contradictions?: Contradiction[];
  rightsImbalance?: RightsImbalance[];
  structuralAnalysis?: StructuralAnalysis;
}

export async function exportToDocx(data: ExportData | ContractParagraph[]) {
  try {
    // Dynamic import of docx to avoid bundling issues
    const { Document, Packer, Paragraph, TextRun, BorderStyle, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = await import("docx");

    // Handle backward compatibility - if array is passed, convert to object
    const exportData: ExportData = Array.isArray(data) 
      ? { contractParagraphs: data }
      : data;

    const { contractParagraphs, missingRequirements, contradictions, rightsImbalance, structuralAnalysis } = exportData;

    const children: any[] = [];

    // Title
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Отчет по анализу договора",
            bold: true,
            size: 32,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 400,
        },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `Дата создания: ${new Date().toLocaleDateString('ru-RU')}`,
            size: 20,
            color: "666666",
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 600,
        },
      })
    );

    // Structural Analysis Section
    if (structuralAnalysis) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "1. СТРУКТУРНЫЙ АНАЛИЗ ДОГОВОРА",
              bold: true,
              size: 24,
            }),
          ],
          spacing: {
            before: 400,
            after: 300,
          },
        })
      );

      // Overall Assessment
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Общая оценка:",
              bold: true,
              size: 20,
            }),
          ],
          spacing: {
            before: 200,
            after: 100,
          },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: structuralAnalysis.overallAssessment || "Не указано",
              size: 18,
            }),
          ],
          spacing: {
            after: 200,
          },
        })
      );

      // Legal Compliance
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Соответствие законодательству РФ:",
              bold: true,
              size: 20,
            }),
          ],
          spacing: {
            before: 200,
            after: 100,
          },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: structuralAnalysis.legalCompliance || "Не указано",
              size: 18,
            }),
          ],
          spacing: {
            after: 200,
          },
        })
      );

      // Key Risks
      if (structuralAnalysis.keyRisks && structuralAnalysis.keyRisks.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Ключевые риски:",
                bold: true,
                size: 20,
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          })
        );

        structuralAnalysis.keyRisks.forEach((risk, index) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${index + 1}. ${risk}`,
                  size: 18,
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        });
      }

      // Recommendations
      if (structuralAnalysis.recommendations && structuralAnalysis.recommendations.length > 0) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Рекомендации:",
                bold: true,
                size: 20,
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          })
        );

        structuralAnalysis.recommendations.forEach((recommendation, index) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `${index + 1}. ${recommendation}`,
                  size: 18,
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        });
      }

      // Structure Comments
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Комментарии по структуре договора:",
              bold: true,
              size: 20,
            }),
          ],
          spacing: {
            before: 200,
            after: 100,
          },
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: structuralAnalysis.structureComments || "Не указано",
              size: 18,
            }),
          ],
          spacing: {
            after: 300,
          },
        })
      );
    }

    // Contract Analysis Section
    if (contractParagraphs && contractParagraphs.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "2. АНАЛИЗ ДОГОВОРА ПО АБЗАЦАМ",
              bold: true,
              size: 24,
            }),
          ],
          spacing: {
            before: 400,
            after: 300,
          },
        })
      );

      contractParagraphs.forEach((paragraph, index) => {
        // Paragraph text
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `Абзац ${index + 1}:`,
                bold: true,
                size: 18,
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: paragraph.text || "Текст не указан",
                size: 16,
              }),
            ],
            spacing: {
              after: 100,
            },
          })
        );

        // Category
        if (paragraph.category) {
          const categoryLabel = paragraph.category === 'checklist' ? 'Соответствует требованиям'
            : paragraph.category === 'partial' ? 'Частично соответствует'
            : paragraph.category === 'risk' ? 'Содержит риски'
            : paragraph.category === 'missing' ? 'Отсутствующее требование'
            : paragraph.category === 'other' || paragraph.category === 'ambiguous' ? 'Требует внимания'
            : 'Прочее';

          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Категория: ${categoryLabel}`,
                  size: 16,
                  bold: true,
                  color: paragraph.category === 'checklist' ? '16A34A'
                    : paragraph.category === 'partial' ? 'D97706'
                    : paragraph.category === 'risk' ? 'DC2626'
                    : paragraph.category === 'missing' ? 'EC4899'
                    : '6366F1',
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        }

        // Comment
        if (paragraph.comment) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Комментарий AI: ${paragraph.comment}`,
                  size: 16,
                  italics: true,
                  color: "666666",
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        }

        // Recommendation
        if (paragraph.recommendation) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Рекомендация: ${paragraph.recommendation}`,
                  size: 16,
                  color: "D97706",
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        }

        // Improved clause
        if (paragraph.improvedClause) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Улучшенная формулировка: ${paragraph.improvedClause}`,
                  size: 16,
                  color: "16A34A",
                }),
              ],
              spacing: {
                after: 200,
              },
            })
          );
        }
      });
    }

    // Missing Requirements Section
    if (missingRequirements && missingRequirements.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `3. ОТСУТСТВУЮЩИЕ ТРЕБОВАНИЯ (${missingRequirements.length})`,
              bold: true,
              size: 24,
            }),
          ],
          spacing: {
            before: 400,
            after: 300,
          },
        })
      );

      missingRequirements.forEach((requirement, index) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${index + 1}. ${requirement.text || "Текст не указан"}`,
                size: 18,
                bold: true,
                color: "D97706",
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          })
        );

        if (requirement.comment) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: requirement.comment,
                  size: 16,
                  color: "D97706",
                }),
              ],
              spacing: {
                after: 100,
              },
            })
          );
        }

        if (requirement.recommendation) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `Рекомендация: ${requirement.recommendation}`,
                  size: 16,
                  color: "D97706",
                }),
              ],
              spacing: {
                after: 200,
              },
            })
          );
        }
      });
    }

    // Contradictions Section
    if (contradictions && contradictions.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `4. ВЫЯВЛЕННЫЕ ПРОТИВОРЕЧИЯ (${contradictions.length})`,
              bold: true,
              size: 24,
            }),
          ],
          spacing: {
            before: 400,
            after: 300,
          },
        })
      );

      contradictions.forEach((contradiction, index) => {
        const typeLabel = contradiction.type === 'temporal' ? 'Временное противоречие'
          : contradiction.type === 'financial' ? 'Финансовое противоречие'
          : contradiction.type === 'quantitative' ? 'Количественное противоречие'
          : contradiction.type === 'legal' ? 'Правовое противоречие'
          : 'Противоречие';

        const severityLabel = contradiction.severity === 'high' ? 'Высокий'
          : contradiction.severity === 'medium' ? 'Средний'
          : contradiction.severity === 'low' ? 'Низкий'
          : 'Неизвестно';

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${index + 1}. ${typeLabel} (${severityLabel} риск)`,
                size: 20,
                bold: true,
                color: "DC2626",
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: contradiction.description,
                size: 16,
                color: "333333",
              }),
            ],
            spacing: {
              after: 200,
            },
          })
        );

        // Добавляем таблицу для сравнения противоречащих пунктов
        const contradictionTable = new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Первый пункт",
                          bold: true,
                          size: 16,
                          color: "DC2626",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Второй пункт",
                          bold: true,
                          size: 16,
                          color: "DC2626",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: contradiction.conflictingParagraphs.paragraph1?.text || "Текст не указан",
                          size: 14,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Значение: ${contradiction.conflictingParagraphs.paragraph1?.value || "Не указано"}`,
                          size: 12,
                          bold: true,
                          color: "DC2626",
                        }),
                      ],
                      spacing: {
                        before: 100,
                      },
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: contradiction.conflictingParagraphs.paragraph2?.text || "Текст не указан",
                          size: 14,
                        }),
                      ],
                    }),
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Значение: ${contradiction.conflictingParagraphs.paragraph2?.value || "Не указано"}`,
                          size: 12,
                          bold: true,
                          color: "DC2626",
                        }),
                      ],
                      spacing: {
                        before: 100,
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        children.push(
          contradictionTable,
          new Paragraph({
            children: [
              new TextRun({
                text: `Рекомендация: ${contradiction.recommendation}`,
                size: 16,
                color: "D97706",
                bold: true,
              }),
            ],
            spacing: {
              before: 200,
              after: 300,
            },
          })
        );
      });
    }

    // Rights Imbalance Section
    if (rightsImbalance && rightsImbalance.length > 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `5. ДИСБАЛАНС ПРАВ СТОРОН (${rightsImbalance.length})`,
              bold: true,
              size: 24,
            }),
          ],
          spacing: {
            before: 400,
            after: 300,
          },
        })
      );

      rightsImbalance.forEach((imbalance, index) => {
        const typeLabel = imbalance.type === 'termination' ? 'Расторжение договора'
          : imbalance.type === 'modification' ? 'Изменение условий'
          : imbalance.type === 'liability' ? 'Ответственность'
          : imbalance.type === 'control' ? 'Контроль исполнения'
          : imbalance.type === 'procedural' ? 'Процедурные права'
          : imbalance.type === 'weighted_analysis' ? 'Взвешенный анализ'
          : 'Общие права';

        const severityLabel = imbalance.severity === 'high' ? 'Высокий'
          : imbalance.severity === 'medium' ? 'Средний'
          : imbalance.severity === 'low' ? 'Низкий'
          : 'Неизвестно';

        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `${index + 1}. ${typeLabel} (${severityLabel} дисбаланс)`,
                size: 20,
                bold: true,
                color: "7C3AED",
              }),
            ],
            spacing: {
              before: 200,
              after: 100,
            },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: imbalance.description,
                size: 16,
                color: "333333",
              }),
            ],
            spacing: {
              after: 200,
            },
          })
        );

        // Добавляем таблицу для сравнения прав
        const rightsTable = new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Права покупателя",
                          bold: true,
                          size: 16,
                          color: "059669",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: "Права поставщика",
                          bold: true,
                          size: 16,
                          color: "DC2626",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `${imbalance.buyerRights}/10`,
                          size: 18,
                          bold: true,
                          color: "059669",
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `${imbalance.supplierRights}/10`,
                          size: 18,
                          bold: true,
                          color: "DC2626",
                        }),
                      ],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        children.push(
          rightsTable,
          new Paragraph({
            children: [
              new TextRun({
                text: `Рекомендация: ${imbalance.recommendation}`,
                size: 16,
                color: "D97706",
                bold: true,
              }),
            ],
            spacing: {
              before: 200,
              after: 200,
            },
          })
        );

        // Add clauses table if available
        const buyerClauses = (imbalance.buyerRightsClauses || []).filter(clause => clause && clause.text);
        const supplierClauses = (imbalance.supplierRightsClauses || []).filter(clause => clause && clause.text);
        
        if (buyerClauses.length > 0 || supplierClauses.length > 0) {
          // Создаем таблицу для пунктов прав
          const maxRows = Math.max(buyerClauses.length, supplierClauses.length);
          const clausesTableRows = [
            // Заголовок таблицы
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Права Покупателя (${buyerClauses.length})`,
                          bold: true,
                          size: 16,
                          color: "059669",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: `Права Поставщика (${supplierClauses.length})`,
                          bold: true,
                          size: 16,
                          color: "DC2626",
                        }),
                      ],
                    }),
                  ],
                  width: {
                    size: 50,
                    type: WidthType.PERCENTAGE,
                  },
                }),
              ],
            }),
          ];

          // Добавляем строки с пунктами
          for (let i = 0; i < maxRows; i++) {
            const buyerClause = buyerClauses[i];
            const supplierClause = supplierClauses[i];

            clausesTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: buyerClause ? `${i + 1}. ${buyerClause.text}` : "",
                            size: 12,
                            color: "333333",
                          }),
                        ],
                      }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: supplierClause ? `${i + 1}. ${supplierClause.text}` : "",
                            size: 12,
                            color: "333333",
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              })
            );
          }

          const clausesTable = new Table({
            width: {
              size: 100,
              type: WidthType.PERCENTAGE,
            },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
              insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
            },
            rows: clausesTableRows,
          });

          children.push(clausesTable);
        }
      });
    }

    const doc = new Document({
      sections: [
        {
          children: children,
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
    throw new Error(`Failed to export document: ${error.message}`);
  }
}