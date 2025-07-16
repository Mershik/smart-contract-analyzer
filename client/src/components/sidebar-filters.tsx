import { Filter, Users, Building, ShoppingCart, Scale } from "lucide-react";
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
  showRightsImbalance?: boolean;
  onToggleCompliance: (_checked: boolean) => void;
  onTogglePartial?: (_checked: boolean) => void;
  onToggleRisks: (_checked: boolean) => void;
  onToggleMissing: (_checked: boolean) => void;
  onToggleOther: (_checked: boolean) => void;
  onToggleContradictions: (_checked: boolean) => void;
  onToggleRightsImbalance?: (_checked: boolean) => void;
  hasResults: boolean;
  complianceCount: number;
  partialCount?: number;
  riskCount: number;
  missingCount: number;
  otherCount: number;
  contradictionsCount: number;
  rightsImbalanceCount?: number;
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
  showRightsImbalance,
  onToggleCompliance,
  onTogglePartial,
  onToggleRisks,
  onToggleMissing,
  onToggleOther,
  onToggleContradictions,
  onToggleRightsImbalance,
  hasResults,
  complianceCount,
  partialCount,
  riskCount,
  missingCount,
  otherCount,
  contradictionsCount,
  rightsImbalanceCount,
  perspective,
  onPerspectiveChange,
}: SidebarFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-24">
      {/* Perspective Selector */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Users className="mr-2 text-orange-600" size={20} />
          Перспектива анализа
        </h3>
        
        <div className="grid grid-cols-1 gap-3">
          <Button
            variant={perspective === 'buyer' ? 'default' : 'outline'}
            onClick={() => onPerspectiveChange('buyer')}
            className={`px-4 py-3 flex items-center justify-center space-x-2 ${
              perspective === 'buyer' 
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
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
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
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
              <span>👤 Анализ с позиции покупателя - выявление рисков и невыгодных условий</span>
            ) : (
              <span>🏢 Анализ с позиции поставщика - проверка обязательств и ограничений</span>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Filter className="mr-2 text-blue-600" size={20} />
          Фильтры результатов
        </h3>
        
        <div className="space-y-4">
          {/* Соответствие требованиям */}
          <div className="flex items-center justify-between">
            <label htmlFor="compliance" className="flex items-center space-x-3 cursor-pointer">
              <Checkbox 
                id="compliance"
                checked={showCompliance}
                onCheckedChange={onToggleCompliance}
              />
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Соответствует</span>
              </div>
            </label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {complianceCount}
            </span>
          </div>

          {/* Частичное соответствие */}
          {onTogglePartial && (
            <div className="flex items-center justify-between">
              <label htmlFor="partial" className="flex items-center space-x-3 cursor-pointer">
                <Checkbox 
                  id="partial"
                  checked={showPartial}
                  onCheckedChange={onTogglePartial}
                />
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                  <span className="text-sm font-medium text-gray-700">Частично</span>
                </div>
              </label>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {partialCount || 0}
              </span>
            </div>
          )}

          {/* Риски */}
          <div className="flex items-center justify-between">
            <label htmlFor="risks" className="flex items-center space-x-3 cursor-pointer">
              <Checkbox 
                id="risks"
                checked={showRisks}
                onCheckedChange={onToggleRisks}
              />
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Риски</span>
              </div>
            </label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {riskCount}
            </span>
          </div>

          {/* Отсутствующие */}
          <div className="flex items-center justify-between">
            <label htmlFor="missing" className="flex items-center space-x-3 cursor-pointer">
              <Checkbox 
                id="missing"
                checked={showMissing}
                onCheckedChange={onToggleMissing}
              />
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Отсутствует</span>
              </div>
            </label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {missingCount}
            </span>
          </div>

          {/* Неоднозначные и прочие */}
          <div className="flex items-center justify-between">
            <label htmlFor="other" className="flex items-center space-x-3 cursor-pointer">
              <Checkbox 
                id="other"
                checked={showOther}
                onCheckedChange={onToggleOther}
              />
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Неоднозначные</span>
              </div>
            </label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {otherCount}
            </span>
          </div>

          {/* Противоречия */}
          <div className="flex items-center justify-between">
            <label htmlFor="contradictions" className="flex items-center space-x-3 cursor-pointer">
              <Checkbox 
                id="contradictions"
                checked={showContradictions}
                onCheckedChange={onToggleContradictions}
              />
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Противоречия</span>
              </div>
            </label>
            <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {contradictionsCount}
            </span>
          </div>

          {/* Дисбаланс прав - показываем только если есть результаты анализа */}
          {onToggleRightsImbalance && hasResults && (
            <div className="flex items-center justify-between">
              <label htmlFor="rightsImbalance" className="flex items-center space-x-3 cursor-pointer">
                <Checkbox 
                  id="rightsImbalance"
                  checked={showRightsImbalance}
                  onCheckedChange={onToggleRightsImbalance}
                />
                <div className="flex items-center space-x-2">
                  <Scale className="w-3 h-3 text-amber-600" />
                  <span className="text-sm font-medium text-gray-700">Дисбаланс прав</span>
                </div>
              </label>
              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {rightsImbalanceCount || 0}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
