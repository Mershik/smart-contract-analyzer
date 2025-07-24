import { AlertTriangle, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ContractParagraph } from "@shared/schema";
import { QualityFeedback } from "./quality-feedback";
import { ExpandableParagraph } from "@/components/expandable-paragraph";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
  onUpdateComment?: (_id: string, _newComment: string) => void;
  onSubmitFeedback?: (_feedback: any) => void;
  result?: any; // Добавляем полный результат анализа
  showContradictions: boolean;
  onToggleCompliance: (_checked: boolean) => void;
  onTogglePartial?: (_checked: boolean) => void;
  onToggleRisks: (_checked: boolean) => void;
  onToggleMissing: (_checked: boolean) => void;
  onToggleOther: (_checked: boolean) => void;
  onToggleContradictions: (_checked: boolean) => void;
  complianceCount: number;
  partialCount?: number;
  riskCount: number;
  missingCount: number;
  otherCount: number;
  contradictionsCount: number;
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
  onSubmitFeedback,
  result,
  showContradictions,
  onToggleCompliance,
  onTogglePartial,
  onToggleRisks,
  onToggleMissing,
  onToggleOther,
  onToggleContradictions,
  complianceCount,
  partialCount,
  riskCount,
  missingCount,
  otherCount,
  contradictionsCount
}: AnalysisResultsProps) {
  
  const handleExport = () => {
    exportToDocx();
  };

  // Теперь показываем все абзацы, а фильтрация будет через стили
  const visibleParagraphs = contractParagraphs;

  return (
    <>
      {/* Информационная панель */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-row justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-gray-900">Результаты анализа</h3>
          <Button onClick={handleExport} className="flex items-center gap-2">
            <Download size={16} />
            Экспорт в DOCX
          </Button>
        </div>
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
      </div>

      {/* Основной текст договора с анализом */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center mb-6">
          <FileText className="w-5 h-5 mr-3 text-gray-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Анализ договора по абзацам
          </h3>
        </div>
        <div className="space-y-3">
          {visibleParagraphs.map((paragraph) => (
            <ExpandableParagraph
              key={paragraph.id}
              paragraph={paragraph}
              showCompliance={showCompliance}
              showPartial={showPartial}
              showRisks={showRisks}
              showOther={showOther}
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6" id="missing-requirements">
          <div className="flex items-center mb-6">
            <AlertTriangle className="w-5 h-5 mr-3 text-orange-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Отсутствующие требования ({missingRequirements.length})
            </h3>
          </div>
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
    </>
  );
}
