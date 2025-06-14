import { ChartLine, CheckCircle, AlertTriangle, ClipboardList, AlertCircle, FileText } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { ContractParagraph } from "@shared/schema";
import { exportToDocx } from "@/lib/docx-export";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { EditableComment } from "./editable-comment";
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

  // Подсчитываем количество каждой категории
  const complianceCount = contractParagraphs.filter(p => p.category === 'checklist').length;
  const partialCount = contractParagraphs.filter(p => p.category === 'partial').length;
  const riskCount = contractParagraphs.filter(p => p.category === 'risk').length;
  const missingCount = missingRequirements.length;
  const ambiguousInTextCount = contractParagraphs.filter(p => p.category === 'ambiguous').length;
  const otherInTextCount = contractParagraphs.filter(p => p.category === 'other').length;
  const ambiguousCount = ambiguousInTextCount + ambiguousConditions.length;

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

      {/* Неоднозначные условия */}
      {showOther && ambiguousConditions.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow border">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 text-yellow-500" />
            Неоднозначные условия ({ambiguousConditions.length})
          </h4>
          <div className="space-y-3">
            {ambiguousConditions.map((condition) => (
              <div key={condition.id} className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h5 className="font-medium text-yellow-900 mb-2">{condition.text}</h5>
                <p className="text-yellow-800 text-sm mb-3">{condition.comment}</p>
                {condition.recommendation && (
                  <div className="bg-white border border-yellow-300 rounded p-3 mt-2">
                    <p className="text-yellow-900 text-sm font-medium">Рекомендация:</p>
                    <p className="text-yellow-800 text-sm">{condition.recommendation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Compliance Summary */}
        {complianceCount > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h5 className="font-semibold text-green-800 mb-3 flex items-center">
              <CheckCircle className="w-4 h-4 mr-2" />
              Полностью ({complianceCount})
            </h5>
            <div className="space-y-2 text-sm">
              {contractParagraphs
                .filter(p => p.category === 'checklist')
                .slice(0, 3)
                .map(p => (
                  <div key={p.id} className="text-green-700">
                    {p.comment || p.text.substring(0, 80) + '...'}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Partial Compliance Summary */}
        {partialCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h5 className="font-semibold text-amber-800 mb-3 flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              Частично ({partialCount})
            </h5>
            <div className="space-y-2 text-sm">
              {contractParagraphs
                .filter(p => p.category === 'partial')
                .slice(0, 3)
                .map(p => (
                  <div key={p.id} className="text-amber-700">
                    {p.comment || p.text.substring(0, 80) + '...'}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Risk Summary */}
        {riskCount > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h5 className="font-semibold text-red-800 mb-3 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Риски ({riskCount})
            </h5>
            <div className="space-y-2 text-sm">
              {contractParagraphs
                .filter(p => p.category === 'risk')
                .slice(0, 3)
                .map(p => (
                  <div key={p.id} className="text-red-700">
                    {p.comment || p.text.substring(0, 80) + '...'}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Missing Requirements Summary */}
        {missingCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <h5 className="font-semibold text-orange-800 mb-3 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Отсутствует ({missingCount})
            </h5>
            <div className="space-y-2 text-sm">
              {missingRequirements
                .slice(0, 3)
                .map(p => (
                  <div key={p.id} className="text-orange-700">
                    {p.comment || p.text.substring(0, 80) + '...'}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
      
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
