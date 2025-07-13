import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare, Lightbulb, Edit, AlertTriangle } from "lucide-react";
import type { ContractParagraph } from "@shared/schema";

interface ExpandableParagraphProps {
  paragraph: ContractParagraph;
  showCompliance?: boolean;
  showPartial?: boolean;
  showRisks?: boolean;
  showOther?: boolean;
  onToggle?: (id: string) => void;
}

export function ExpandableParagraph({ 
  paragraph, 
  showCompliance = true,
  showPartial = true,
  showRisks = true,
  showOther = true,
  onToggle 
}: ExpandableParagraphProps) {
  const [isExpanded, setIsExpanded] = useState(paragraph.isExpanded || false);

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onToggle?.(paragraph.id);
  };

  const getCategoryColor = (category?: string) => {
    // Проверяем, включен ли фильтр для данной категории
    const isFilterActive = () => {
      switch (category) {
        case 'checklist':
          return showCompliance;
        case 'partial':
          return showPartial;
        case 'risk':
          return showRisks;
        case 'ambiguous':
        case 'other':
          return showOther;
        default:
          return true;
      }
    };

    // Если фильтр выключен, возвращаем стиль по умолчанию (как для нейтральных элементов)
    if (!isFilterActive()) {
      return 'bg-gray-50 border-l-4 border-l-gray-300 hover:bg-gray-100';
    }

    // Если фильтр включен, возвращаем обычные цвета
    switch (category) {
      case 'checklist':
        return 'bg-green-50 border-l-4 border-l-green-600 hover:bg-green-100';
      case 'partial':
        return 'bg-amber-50 border-l-4 border-l-amber-600 hover:bg-amber-100';
      case 'risk':
        return 'bg-red-50 border-l-4 border-l-red-600 hover:bg-red-100';
      case 'ambiguous':
        return 'bg-indigo-50 border-l-4 border-l-indigo-600 hover:bg-indigo-100';
      case 'other':
        return 'bg-indigo-50 border-l-4 border-l-indigo-600 hover:bg-indigo-100';
      default:
        return 'bg-gray-50 border-l-4 border-l-gray-300 hover:bg-gray-100';
    }
  };

  const hasDetails = paragraph.comment || paragraph.recommendation || paragraph.improvedClause || paragraph.legalRisk;

  return (
    <div className={`border border-gray-200 rounded-lg mb-2 transition-all duration-200 ${getCategoryColor(paragraph.category)}`}>
      {/* Основной текст абзаца */}
      <div 
        className={`p-4 cursor-pointer transition-all duration-200 ${hasDetails ? '' : 'cursor-default'}`}
        onClick={hasDetails ? handleToggle : undefined}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-gray-800 leading-relaxed text-sm">{paragraph.text}</p>
          </div>
          {hasDetails && (
            <div className="ml-4 flex-shrink-0">
              {isExpanded ? (
                <ChevronUp className="text-gray-400 hover:text-gray-600" size={18} />
              ) : (
                <ChevronDown className="text-gray-400 hover:text-gray-600" size={18} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Выпадающая панель с деталями */}
      {hasDetails && (
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}>
          <div className="border-t border-gray-200 bg-white">
            <div className="p-4 space-y-3">
              {/* Комментарий */}
              {paragraph.comment && (
                <div className="bg-blue-50 border-l-4 border-l-blue-400 p-3 rounded-r">
                  <div className="flex items-center mb-2">
                    <MessageSquare className="text-blue-600 mr-2" size={14} />
                    <h5 className="font-medium text-blue-900 text-sm">Анализ</h5>
                  </div>
                  <p className="text-blue-800 text-sm leading-relaxed">{paragraph.comment}</p>
                </div>
              )}

              {/* Рекомендация */}
              {paragraph.recommendation && (
                <div className="bg-orange-50 border-l-4 border-l-orange-400 p-3 rounded-r">
                  <div className="flex items-center mb-2">
                    <Lightbulb className="text-orange-600 mr-2" size={14} />
                    <h5 className="font-medium text-orange-900 text-sm">Рекомендация</h5>
                  </div>
                  <p className="text-orange-800 text-sm leading-relaxed">{paragraph.recommendation}</p>
                </div>
              )}

              {/* Улучшенная формулировка */}
              {paragraph.improvedClause && (
                <div className="bg-green-50 border-l-4 border-l-green-400 p-3 rounded-r">
                  <div className="flex items-center mb-2">
                    <Edit className="text-green-600 mr-2" size={14} />
                    <h5 className="font-medium text-green-900 text-sm">Улучшенная формулировка</h5>
                  </div>
                  <div className="bg-white border border-green-200 rounded p-3 mt-2">
                    <p className="text-green-800 text-sm leading-relaxed">
                      {paragraph.improvedClause}
                    </p>
                  </div>
                </div>
              )}

              {/* Правовые риски */}
              {paragraph.legalRisk && (
                <div className="bg-red-50 border-l-4 border-l-red-400 p-3 rounded-r">
                  <div className="flex items-center mb-2">
                    <AlertTriangle className="text-red-600 mr-2" size={14} />
                    <h5 className="font-medium text-red-900 text-sm">Правовые риски</h5>
                  </div>
                  <p className="text-red-800 text-sm leading-relaxed">{paragraph.legalRisk}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 