import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

export default function Analytics() {
  const handleBack = () => {
    window.close();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button
              variant="ghost"
              onClick={handleBack}
              className="mr-4"
            >
              <ArrowLeft size={20} className="mr-2" />
              Назад
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Аналитика качества</h1>
              <p className="text-xs text-gray-500">Мониторинг эффективности ИИ-анализа</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnalyticsDashboard />
      </div>
    </div>
  );
} 