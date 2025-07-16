import { AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface RiskInputProps {
  value: string;
  onChange: (value: string) => void;
  perspective: 'buyer' | 'supplier';
}

export function RiskInput({ value, onChange, perspective }: RiskInputProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center mb-4">
        <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center mr-3">
          <AlertTriangle className="text-red-600" size={16} />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Критические риски ({perspective === 'buyer' ? 'покупатель' : 'поставщик'})
        </h3>
      </div>
      
      <div className="space-y-4">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          className="w-full p-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-vertical text-sm leading-relaxed"
          placeholder="Введите критические риски договора..."
        />
      </div>
    </div>
  );
}
