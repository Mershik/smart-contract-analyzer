import { FileText, Upload, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface ContractInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ContractInput({ value, onChange }: ContractInputProps) {
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        onChange(text);
      };
      reader.readAsText(file);
    }
  };

  const handleClear = () => {
    onChange("");
  };

  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type === "text/plain") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        onChange(text);
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <FileText className="hf-orange-text mr-2" size={20} />
          Договор поставщика
        </h3>
        <div className="flex items-center space-x-2">
          <input
            type="file"
            id="contract-upload"
            accept=".txt"
            onChange={handleFileUpload}
            className="hidden"
          />
          <label htmlFor="contract-upload">
            <Button variant="ghost" size="sm" className="text-sm text-gray-500 hover:text-gray-700 transition-colors" asChild>
              <span className="cursor-pointer">
                <Upload size={16} className="mr-1" />
                Загрузить файл
              </span>
            </Button>
          </label>
          <span className="text-gray-300">|</span>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClear}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Trash2 size={16} className="mr-1" />
            Очистить
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="h-64 p-4 border border-gray-200 rounded-lg text-sm leading-relaxed resize-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
        placeholder="Вставьте текст договора поставщика или перетащите файл...

Пример: ДОГОВОР ПОСТАВКИ №123
1. ПРЕДМЕТ ДОГОВОРА
1.1. Поставщик обязуется передать в собственность Покупателю товары согласно спецификации...
2. ЦЕНА И ПОРЯДОК РАСЧЕТОВ
2.1. Общая стоимость товаров составляет..."
      />
      <div className="mt-2 flex justify-between items-center text-xs text-gray-500">
        <span>Поддерживаются: .txt файлы</span>
        <span>{value.length} символов</span>
      </div>
    </div>
  );
}
