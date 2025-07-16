import { Users, Building, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AnalysisPerspective = 'buyer' | 'supplier';

interface PerspectiveSelectorProps {
  perspective: 'buyer' | 'supplier';
  onPerspectiveChange: (_perspective: 'buyer' | 'supplier') => void;
}

export function PerspectiveSelector({ perspective, onPerspectiveChange }: PerspectiveSelectorProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Users className="hf-orange-text mr-2" size={20} />
        Перспектива анализа
      </h3>
      
      <div className="space-y-3">
        <Button
          variant={perspective === 'buyer' ? 'default' : 'outline'}
          onClick={() => onPerspectiveChange('buyer')}
          className={`w-full px-4 py-3 flex items-center justify-center space-x-2 ${
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
          className={`w-full px-4 py-3 flex items-center justify-center space-x-2 ${
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
            <span>👤 Анализ с позиции покупателя - выявление рисков и невыгодных условий</span>
          ) : (
            <span>🏢 Анализ с позиции поставщика - проверка обязательств и ограничений</span>
          )}
        </div>
      </div>
    </div>
  );
} 