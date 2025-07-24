import { AlertTriangle, Clock, DollarSign, Hash, Scale } from "lucide-react";
import type { Contradiction } from "@shared/schema";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface ContradictionsResultsProps {
  contradictions: Contradiction[];
  showContradictions: boolean;
}

export function ContradictionsResults({ contradictions, showContradictions }: ContradictionsResultsProps) {
  // Всегда рендерим компонент для корректной навигации
  if (!showContradictions) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center mb-6">
          <AlertTriangle className="w-5 h-5 mr-3 text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900">
            Выявленные противоречия (скрыто)
          </h3>
        </div>
        <div className="text-center py-8 text-gray-500">
          <p>Фильтр противоречий отключен</p>
        </div>
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'temporal':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'financial':
        return <DollarSign className="w-5 h-5 text-green-600" />;
      case 'quantitative':
        return <Hash className="w-5 h-5 text-purple-600" />;
      case 'legal':
        return <Scale className="w-5 h-5 text-orange-600" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'temporal':
        return 'Временное противоречие';
      case 'financial':
        return 'Финансовое противоречие';
      case 'quantitative':
        return 'Количественное противоречие';
      case 'legal':
        return 'Правовое противоречие';
      default:
        return 'Противоречие';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'medium':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'low':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'Высокий';
      case 'medium':
        return 'Средний';
      case 'low':
        return 'Низкий';
      default:
        return 'Неизвестно';
    }
  };

  const [expanded, setExpanded] = useState<{ [id: string]: { p1: boolean; p2: boolean } }>({});
  const toggle = (id: string, which: 'p1' | 'p2') => {
    setExpanded(prev => ({
      ...prev,
      [id]: {
        p1: which === 'p1' ? !prev[id]?.p1 : !!prev[id]?.p1,
        p2: which === 'p2' ? !prev[id]?.p2 : !!prev[id]?.p2,
      }
    }));
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center mb-6">
        <AlertTriangle className="w-5 h-5 mr-3 text-red-500" />
        <h3 className="text-lg font-semibold text-gray-900">
          Выявленные противоречия ({contradictions.length})
        </h3>
      </div>
      <div>
        {contradictions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>Противоречий не обнаружено</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contradictions.map((contradiction) => (
              <div key={contradiction.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center">
                    {getTypeIcon(contradiction.type)}
                    <div className="ml-3">
                      <h5 className="font-medium text-gray-900">{getTypeLabel(contradiction.type)}</h5>
                      <p className="text-sm text-gray-600">{contradiction.description}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(contradiction.severity)}`}>
                    {getSeverityLabel(contradiction.severity)}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Первый пункт */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h6 className="font-medium text-red-900 mb-2">Первый пункт:</h6>
                    <p
                      className={`text-sm text-red-800 mb-2 select-text transition-colors ${contradiction.conflictingParagraphs.paragraph1.text.length > 100 ? 'cursor-pointer hover:bg-red-100' : ''}`}
                      onClick={() => toggle(contradiction.id, 'p1')}
                      style={{ whiteSpace: 'pre-line' }}
                    >
                      {expanded[contradiction.id]?.p1
                        ? contradiction.conflictingParagraphs.paragraph1.text
                        : (contradiction.conflictingParagraphs.paragraph1.text.length > 100
                          ? `${contradiction.conflictingParagraphs.paragraph1.text.substring(0, 100)}...`
                          : contradiction.conflictingParagraphs.paragraph1.text)
                      }
                    </p>
                    <div className="bg-red-100 rounded px-2 py-1">
                      <span className="text-xs font-medium text-red-900">Значение: {contradiction.conflictingParagraphs.paragraph1.value}</span>
                    </div>
                  </div>
                  {/* Второй пункт */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h6 className="font-medium text-red-900 mb-2">Второй пункт:</h6>
                    <p
                      className={`text-sm text-red-800 mb-2 select-text transition-colors ${contradiction.conflictingParagraphs.paragraph2.text.length > 100 ? 'cursor-pointer hover:bg-red-100' : ''}`}
                      onClick={() => toggle(contradiction.id, 'p2')}
                      style={{ whiteSpace: 'pre-line' }}
                    >
                      {expanded[contradiction.id]?.p2
                        ? contradiction.conflictingParagraphs.paragraph2.text
                        : (contradiction.conflictingParagraphs.paragraph2.text.length > 100
                          ? `${contradiction.conflictingParagraphs.paragraph2.text.substring(0, 100)}...`
                          : contradiction.conflictingParagraphs.paragraph2.text)
                      }
                    </p>
                    <div className="bg-red-100 rounded px-2 py-1">
                      <span className="text-xs font-medium text-red-900">Значение: {contradiction.conflictingParagraphs.paragraph2.value}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <h6 className="font-medium text-orange-900 mb-2">Рекомендация:</h6>
                  <p className="text-sm text-orange-800">{contradiction.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 