import { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Brain, FileText, AlertTriangle } from "lucide-react";

interface AnalysisProgressProps {
  isAnalyzing: boolean;
  onComplete?: () => void;
}

const ANALYSIS_STEPS = [
  { id: 'parsing', label: 'Разбор договора...', icon: FileText, duration: 2000 },
  { id: 'ai_analysis', label: 'ИИ-анализ условий...', icon: Brain, duration: 15000 },
  { id: 'validation', label: 'Проверка соответствия...', icon: CheckCircle2, duration: 3000 },
  { id: 'risks', label: 'Выявление рисков...', icon: AlertTriangle, duration: 2000 },
];

export function AnalysisProgress({ isAnalyzing }: AnalysisProgressProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setCurrentStep(0);
      setProgress(0);
      return;
    }

    let currentTime = 0;
    let progressInterval: NodeJS.Timeout;
    
    // Начинаем плавную анимацию прогресса
    const startProgressAnimation = () => {
      progressInterval = setInterval(() => {
        setProgress(prev => {
          // Замедляем прогресс по мере приближения к 95%
          const nextProgress = prev + (95 - prev) * 0.02;
          return Math.min(95, nextProgress);
        });
      }, 100);
    };

    // Переключение шагов
    const stepTimers = ANALYSIS_STEPS.map((step, index) => {
      const delay = currentTime;
      currentTime += step.duration;

      return setTimeout(() => {
        setCurrentStep(index);
      }, delay);
    });

    startProgressAnimation();

    return () => {
      stepTimers.forEach(timer => clearTimeout(timer));
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [isAnalyzing]);

  // Не показываем если анализ не идет
  if (!isAnalyzing) return null;

  const CurrentIcon = ANALYSIS_STEPS[currentStep]?.icon || Brain;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full mx-4">
        <div className="text-center space-y-6">
          {/* Иконка и заголовок */}
          <div className="space-y-4">
            <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
              <CurrentIcon className="w-8 h-8 text-orange-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900">
              Анализ договора
            </h3>
          </div>

          {/* Прогресс-бар */}
          <div className="space-y-2">
            <Progress value={progress} className="w-full h-2" />
            <p className="text-sm text-gray-600">
              {Math.round(progress)}% завершено
            </p>
          </div>

          {/* Текущий шаг */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-orange-600">
              {ANALYSIS_STEPS[currentStep]?.label || 'Обработка...'}
            </p>
            
            {/* Список шагов */}
            <div className="space-y-2 text-left">
              {ANALYSIS_STEPS.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                
                return (
                  <div
                    key={step.id}
                    className={`flex items-center space-x-3 text-sm ${
                      isCompleted 
                        ? 'text-green-600' 
                        : isCurrent 
                          ? 'text-orange-600 font-medium' 
                          : 'text-gray-400'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isCurrent ? 'animate-pulse' : ''}`} />
                    <span>{step.label}</span>
                    {isCompleted && (
                      <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 