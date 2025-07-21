import { useState, useEffect } from "react";
import { Filter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface FloatingFiltersProps {
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
  complianceCount: number;
  partialCount?: number;
  riskCount: number;
  missingCount: number;
  otherCount: number;
  contradictionsCount: number;
}

export function FloatingFilters({
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
  complianceCount,
  partialCount,
  riskCount,
  missingCount,
  otherCount,
  contradictionsCount,
}: FloatingFiltersProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Filter className="mr-2 text-blue-600" size={20} />
        Фильтры результатов
      </h3>
      
      <div className="space-y-3">
        {/* Соответствие требованиям */}
        <div className="flex items-center justify-between">
          <label htmlFor="floating-compliance" className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              id="floating-compliance"
              checked={showCompliance}
              onCheckedChange={onToggleCompliance}
            />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">Соответствует</span>
            </div>
          </label>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {complianceCount}
          </span>
        </div>

        {/* Частичное соответствие */}
        {onTogglePartial && (
          <div className="flex items-center justify-between">
            <label htmlFor="floating-partial" className="flex items-center space-x-2 cursor-pointer">
              <Checkbox 
                id="floating-partial"
                checked={showPartial}
                onCheckedChange={onTogglePartial}
              />
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                <span className="text-sm font-medium text-gray-700">Частично</span>
              </div>
            </label>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {partialCount || 0}
            </span>
          </div>
        )}

        {/* Риски */}
        <div className="flex items-center justify-between">
          <label htmlFor="floating-risks" className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              id="floating-risks"
              checked={showRisks}
              onCheckedChange={onToggleRisks}
            />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-red-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">Риски</span>
            </div>
          </label>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {riskCount}
          </span>
        </div>

        {/* Неоднозначные условия */}
        <div className="flex items-center justify-between">
          <label htmlFor="floating-other" className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              id="floating-other"
              checked={showOther}
              onCheckedChange={onToggleOther}
            />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">Неоднозначные</span>
            </div>
          </label>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {otherCount}
          </span>
        </div>

        {/* Отсутствующие требования */}
        <div className="flex items-center justify-between">
          <label htmlFor="floating-missing" className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              id="floating-missing"
              checked={showMissing}
              onCheckedChange={onToggleMissing}
            />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">Отсутствует</span>
            </div>
          </label>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {missingCount}
          </span>
        </div>

        {/* Противоречия */}
        <div className="flex items-center justify-between">
          <label htmlFor="floating-contradictions" className="flex items-center space-x-2 cursor-pointer">
            <Checkbox 
              id="floating-contradictions"
              checked={showContradictions}
              onCheckedChange={onToggleContradictions}
            />
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
              <span className="text-sm font-medium text-gray-700">Противоречия</span>
            </div>
          </label>
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            {contradictionsCount}
          </span>
        </div>

      </div>
    </div>
  );
} 