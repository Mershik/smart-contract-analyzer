import { AlertTriangle, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractParagraph } from "@shared/schema";
import { QualityFeedback } from "./quality-feedback";
import { ExpandableParagraph } from "@/components/expandable-paragraph";

interface AnalysisResultsProps {
  contractParagraphs: ContractParagraph[];
  missingRequirements: ContractParagraph[];
  ambiguousConditions: ContractParagraph[];
  showCompliance: boolean;
  showRisks: boolean;
  showOther: boolean;
  showMissing: boolean;
  showPartial?: boolean;
  exportToDocx: () => void;
  onUpdateComment?: (id: string, newComment: string) => void;
  onSubmitFeedback?: (feedback: any) => void;
}

export function AnalysisResults({ 
  contractParagraphs, 
  missingRequirements,
  ambiguousConditions,
  showCompliance, 
  showRisks, 
  showOther, 
  showMissing, 
  showPartial, 
  exportToDocx,
  onUpdateComment,
  onSubmitFeedback
}: AnalysisResultsProps) {
  
  const handleExport = () => {
    exportToDocx();
  };

  // Фильтруем абзацы для отображения
  const visibleParagraphs = contractParagraphs.filter(paragraph => {
    if (!showCompliance && paragraph.category === 'checklist') return false;
    if (!showPartial && paragraph.category === 'partial') return false;
    if (!showRisks && paragraph.category === 'risk') return false;
    if (!showOther && (paragraph.category === 'other' || paragraph.category === 'ambiguous')) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Заголовок и кнопка экспорта */}
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-bold text-gray-900">Результаты анализа</h3>
        <Button onClick={handleExport} className="flex items-center gap-2">
          <Download size={16} />
          Экспорт в DOCX
          </Button>
      </div>

      {/* Информационная панель */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center mb-2">
          <FileText className="text-blue-600 mr-2" size={20} />
          <h4 className="font-semibold text-blue-900">Как пользоваться результатами</h4>
        </div>
        <p className="text-blue-800 text-sm leading-relaxed">
          Нажимайте на абзацы с цветным фоном для просмотра детального анализа, рекомендаций и улучшенных формулировок. 
          Анализ проводится в соответствии с российским законодательством.
        </p>
      </div>

      {/* Основной текст договора с анализом */}
      <div className="bg-white p-6 rounded-lg shadow border">
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-gray-600" />
          Анализ договора по абзацам
        </h4>
        <div className="space-y-3">
          {visibleParagraphs.map((paragraph) => (
            <ExpandableParagraph
              key={paragraph.id}
              paragraph={paragraph}
              onToggle={(id) => {
                // Здесь можно добавить логику для обработки расширения/сворачивания
                console.log(`Toggled paragraph ${id}`);
              }}
            />
          ))}
        </div>
      </div>

      {/* Отсутствующие требования */}
      {showMissing && missingRequirements.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="w-5 h-5 mr-2 text-orange-500" />
            Отсутствующие требования ({missingRequirements.length})
          </h4>
          <div className="space-y-3">
            {missingRequirements.map((requirement) => (
              <div key={requirement.id} className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h5 className="font-medium text-orange-900 mb-2">{requirement.text}</h5>
                <p className="text-orange-800 text-sm mb-3">{requirement.comment}</p>
                {requirement.recommendation && (
                  <div className="bg-white border border-orange-300 rounded p-3 mt-2">
                    <p className="text-orange-900 text-sm font-medium">Рекомендация:</p>
                    <p className="text-orange-800 text-sm">{requirement.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Quality Feedback */}
      <div className="mt-8">
        <QualityFeedback 
          analysisId={`analysis_${Date.now()}`}
          onSubmitFeedback={onSubmitFeedback}
        />
      </div>
    </div>
  );
}
