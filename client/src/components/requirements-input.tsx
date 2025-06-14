import { CheckSquare, ChevronUp, ChevronDown } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface RequirementsInputProps {
  value: string;
  onChange: (value: string) => void;
  perspective?: 'buyer' | 'supplier';
}

export function RequirementsInput({ value, onChange, perspective = 'buyer' }: RequirementsInputProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const title = perspective === 'buyer' 
    ? 'Чек-лист требований покупателя'
    : 'Чек-лист требований поставщика';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <CheckSquare className="text-green-600 mr-2" size={20} />
          {title}
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={toggleCollapse}
          className="text-sm hf-orange-text hover:text-orange-700 transition-colors"
        >
          {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </Button>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 border border-gray-200 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all ${
          isCollapsed ? 'h-20' : 'h-40'
        }`}
      />
    </div>
  );
}
