import { FileCheck, AlertTriangle, Scale, CheckCircle, HelpCircle } from "lucide-react";
import type { StructuralAnalysis } from "@shared/schema";

interface StructuralAnalysisProps {
  analysis: StructuralAnalysis;
}

export function StructuralAnalysisComponent({ analysis }: StructuralAnalysisProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center mb-6">
        <Scale className="hf-orange-text mr-3" size={24} />
        <div>
          <h3 className="text-xl font-semibold text-gray-900">
            Структурный анализ договора
          </h3>
          <p className="text-sm text-gray-600">
            Проверка проводится в соответствии с законодательством РФ
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Общая оценка */}
        <div className="space-y-4">
          <div className="flex items-center mb-3">
            <FileCheck className="text-blue-600 mr-2" size={20} />
            <h4 className="font-semibold text-gray-900">Общая оценка</h4>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-blue-800 text-sm leading-relaxed">
              {analysis.overallAssessment}
            </p>
          </div>
        </div>

        {/* Соответствие законодательству */}
        <div className="space-y-4">
          <div className="flex items-center mb-3">
            <Scale className="text-green-600 mr-2" size={20} />
            <h4 className="font-semibold text-gray-900">Соответствие законодательству РФ</h4>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 text-sm leading-relaxed">
              {analysis.legalCompliance}
            </p>
          </div>
        </div>

        {/* Ключевые риски */}
        <div className="space-y-4">
          <div className="flex items-center mb-3">
            <AlertTriangle className="text-red-600 mr-2" size={20} />
            <h4 className="font-semibold text-gray-900">Ключевые риски</h4>
          </div>
          <div className="space-y-2">
            {analysis.keyRisks?.map((risk, index) => (
              <div key={index} className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-800 text-sm">{risk}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Неоднозначные условия */}
        {analysis.ambiguousConditions && analysis.ambiguousConditions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center mb-3">
              <HelpCircle className="text-yellow-600 mr-2" size={20} />
              <h4 className="font-semibold text-gray-900">Неоднозначные условия</h4>
            </div>
            <div className="space-y-2">
              {analysis.ambiguousConditions.map((condition, index) => (
                <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-800 text-sm">{condition}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Рекомендации */}
        <div className="space-y-4">
          <div className="flex items-center mb-3">
            <CheckCircle className="text-orange-600 mr-2" size={20} />
            <h4 className="font-semibold text-gray-900">Рекомендации</h4>
          </div>
          <div className="space-y-2">
            {analysis.recommendations?.map((recommendation, index) => (
              <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="text-orange-800 text-sm">{recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Комментарии по структуре */}
      <div className="mt-6">
        <div className="flex items-center mb-3">
          <FileCheck className="text-gray-600 mr-2" size={20} />
          <h4 className="font-semibold text-gray-900">Комментарии по структуре договора</h4>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-gray-800 text-sm leading-relaxed">
            {analysis.structureComments}
          </p>
        </div>
      </div>
    </div>
  );
} 