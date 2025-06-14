import { Palette, Filter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface SidebarFiltersProps {
  showCompliance: boolean;
  showPartial?: boolean;
  showRisks: boolean;
  showMissing: boolean;
  showOther: boolean;
  onToggleCompliance: (checked: boolean) => void;
  onTogglePartial?: (checked: boolean) => void;
  onToggleRisks: (checked: boolean) => void;
  onToggleMissing: (checked: boolean) => void;
  onToggleOther: (checked: boolean) => void;
  hasResults: boolean;
  complianceCount: number;
  partialCount?: number;
  riskCount: number;
  missingCount: number;
  otherCount: number;
}

export function SidebarFilters({
  showCompliance,
  showPartial,
  showRisks,
  showMissing,
  showOther,
  onToggleCompliance,
  onTogglePartial,
  onToggleRisks,
  onToggleMissing,
  onToggleOther,
  hasResults,
  complianceCount,
  partialCount,
  riskCount,
  missingCount,
  otherCount,
}: SidebarFiltersProps) {
  return (
    <div className="space-y-6">
      {/* Analysis Legend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Palette className="hf-orange-text mr-2" size={20} />
          Структура анализа
        </h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 analysis-checklist border border-green-200 rounded"></div>
            <span className="text-sm text-gray-700">Полностью соответствует ({complianceCount})</span>
          </div>
          {(partialCount ?? 0) > 0 && (
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 analysis-partial border border-amber-200 rounded"></div>
              <span className="text-sm text-gray-700">Частично соответствует ({partialCount})</span>
            </div>
          )}
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 analysis-risk border border-red-200 rounded"></div>
            <span className="text-sm text-gray-700">Выявленные риски ({riskCount})</span>
          </div>
          {missingCount > 0 && (
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 analysis-missing border border-orange-200 rounded"></div>
              <span className="text-sm text-gray-700">Отсутствует в договоре ({missingCount})</span>
            </div>
          )}
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 analysis-other border border-yellow-200 rounded"></div>
            <span className="text-sm text-gray-700">Неоднозначные условия ({otherCount})</span>
          </div>
        </div>
      </div>

      {/* Filter Options */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Filter className="hf-orange-text mr-2" size={20} />
          Фильтры отображения
        </h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-compliance"
              checked={showCompliance}
              onCheckedChange={onToggleCompliance}
            />
            <label htmlFor="show-compliance" className="text-sm text-gray-700 cursor-pointer">
              Показать соответствие
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-partial"
              checked={showPartial}
              onCheckedChange={onTogglePartial}
            />
            <label htmlFor="show-partial" className="text-sm text-gray-700 cursor-pointer">
              Показать частичные условия
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-risks"
              checked={showRisks}
              onCheckedChange={onToggleRisks}
            />
            <label htmlFor="show-risks" className="text-sm text-gray-700 cursor-pointer">
              Показать риски
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-missing"
              checked={showMissing}
              onCheckedChange={onToggleMissing}
            />
            <label htmlFor="show-missing" className="text-sm text-gray-700 cursor-pointer">
              Показать отсутствующие требования
            </label>
          </div>
          <div className="flex items-center space-x-3">
            <Checkbox
              id="show-other"
              checked={showOther}
              onCheckedChange={onToggleOther}
            />
            <label htmlFor="show-other" className="text-sm text-gray-700 cursor-pointer">
              Показать неоднозначные условия
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
