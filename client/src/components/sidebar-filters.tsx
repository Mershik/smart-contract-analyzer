import { Filter, Users, Building, ShoppingCart } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export type AnalysisPerspective = 'buyer' | 'supplier';

interface SidebarFiltersProps {
  showCompliance: boolean;
  showPartial?: boolean;
  showRisks: boolean;
  showMissing: boolean;
  showOther: boolean;
  showContradictions: boolean;
  onToggleCompliance: (_checked: boolean) => void;
  onTogglePartial?: (_checked: boolean) => void;
  onToggleRisks: (_checked: boolean) => void;
  onToggleMissing: (_checked: boolean) => void;
  onToggleOther: (_checked: boolean) => void;
  onToggleContradictions: (_checked: boolean) => void;
  hasResults: boolean;
  complianceCount: number;
  partialCount?: number;
  riskCount: number;
  missingCount: number;
  otherCount: number;
  contradictionsCount: number;
  perspective: AnalysisPerspective;
  onPerspectiveChange: (_perspective: AnalysisPerspective) => void;
}

export function SidebarFilters({
  showCompliance,
  showPartial,
  showRisks,
  showMissing,
  showOther,
  showContradictions,
  onToggleCompliance,
  onTogglePartial,
  onToggleRisks,
  onToggleMissing,
  onToggleOther,
  onToggleContradictions,
  _hasResults,
  complianceCount,
  partialCount,
  riskCount,
  missingCount,
  otherCount,
  contradictionsCount,
  perspective,
  onPerspectiveChange,
}: SidebarFiltersProps) {
  return (
    <div className="space-y-6">
      {/* Перспектива анализа */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Users className="hf-orange-text mr-2" size={20} />
          Проверяемая сторона
        </h3>
        
        <div className="grid grid-cols-1 gap-3">
          <Button
            variant={perspective === 'buyer' ? 'default' : 'outline'}
            onClick={() => onPerspectiveChange('buyer')}
            className={`px-4 py-3 flex items-center justify-center space-x-2 ${
              perspective === 'buyer' 
                ? 'hf-orange-bg hover:hf-orange-bg text-white' 
                : 'hover:border-orange-300 hover:bg-orange-50'
            }`}
          >
            <ShoppingCart size={18} />
            <span className="font-medium">Покупатель</span>
          </Button>

          <Button
            variant={perspective === 'supplier' ? 'default' : 'outline'}
            onClick={() => onPerspectiveChange('supplier')}
            className={`px-4 py-3 flex items-center justify-center space-x-2 ${
              perspective === 'supplier' 
                ? 'hf-orange-bg hover:hf-orange-bg text-white' 
                : 'hover:border-orange-300 hover:bg-orange-50'
            }`}
          >
            <Building size={18} />
            <span className="font-medium">Поставщик</span>
          </Button>
        </div>

        <div className="mt-3 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-700">
            {perspective === 'buyer' ? (
              <span>👤 Анализ договора с точки зрения покупателя</span>
            ) : (
              <span>🏢 Анализ договора с точки зрения поставщика</span>
            )}
          </div>
        </div>
      </div>

      {/* Объединенный блок фильтров и структуры анализа */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Filter className="hf-orange-text mr-2" size={20} />
          Фильтры анализа
        </h3>
        <div className="space-y-3">
          {/* Полностью соответствует */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 analysis-checklist rounded"></div>
              <span className="text-sm text-gray-700">Полностью соответствует ({complianceCount})</span>
            </div>
            <Checkbox
              id="show-compliance"
              checked={showCompliance}
              onCheckedChange={onToggleCompliance}
            />
          </div>

          {/* Частично соответствует */}
          {(partialCount ?? 0) > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 analysis-partial rounded"></div>
                <span className="text-sm text-gray-700">Частично соответствует ({partialCount})</span>
              </div>
              <Checkbox
                id="show-partial"
                checked={showPartial}
                onCheckedChange={onTogglePartial}
              />
            </div>
          )}

          {/* Выявленные риски */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 analysis-risk rounded"></div>
              <span className="text-sm text-gray-700">Выявленные риски ({riskCount})</span>
            </div>
            <Checkbox
              id="show-risks"
              checked={showRisks}
              onCheckedChange={onToggleRisks}
            />
          </div>

          {/* Противоречия */}
          {contradictionsCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 bg-purple-50 border border-purple-300 rounded"></div>
                <span className="text-sm text-gray-700">Противоречия ({contradictionsCount})</span>
              </div>
              <Checkbox
                id="show-contradictions"
                checked={showContradictions}
                onCheckedChange={onToggleContradictions}
              />
            </div>
          )}

          {/* Отсутствует в договоре */}
          {missingCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-4 h-4 analysis-missing rounded"></div>
                <span className="text-sm text-gray-700">Отсутствует в договоре ({missingCount})</span>
              </div>
              <Checkbox
                id="show-missing"
                checked={showMissing}
                onCheckedChange={onToggleMissing}
              />
            </div>
          )}

          {/* Неоднозначные условия */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-4 h-4 analysis-other rounded"></div>
              <span className="text-sm text-gray-700">Неоднозначные условия ({otherCount})</span>
            </div>
            <Checkbox
              id="show-other"
              checked={showOther}
              onCheckedChange={onToggleOther}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
