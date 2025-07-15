import { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { Brain, FileText, Search, CheckCircle2, Zap, Clock } from "lucide-react";

interface AnalysisProgressProps {
  isAnalyzing: boolean;
  onComplete?: () => void;
  progress?: string;
}

// Определение всех этапов анализа
const ANALYSIS_STAGES = [
  {
    id: 'preparation',
    label: 'Подготовка данных',
    description: 'Разбивка договора на абзацы и подготовка данных',
    icon: FileText,
    keywords: ['Подготовка данных'],
    progressRange: [0, 10]
  },
  {
    id: 'content',
    label: 'Анализ содержимого',
    description: 'Проверка пунктов договора на соответствие требованиям',
    icon: Brain,
    keywords: ['Анализ содержимого договора', 'Обработка следующей части договора'],
    progressRange: [10, 70]
  },
  {
    id: 'structure',
    label: 'Структурный анализ',
    description: 'Оценка общей структуры и полноты договора',
    icon: Search,
    keywords: ['структурный анализ'],
    progressRange: [70, 80]
  },
  {
    id: 'requirements',
    label: 'Проверка требований',
    description: 'Выявление отсутствующих обязательных условий',
    icon: Search,
    keywords: ['отсутствующих требований'],
    progressRange: [80, 90]
  },
  {
    id: 'finalization',
    label: 'Финализация',
    description: 'Объединение результатов и подготовка отчета',
    icon: Zap,
    keywords: ['Финализация'],
    progressRange: [90, 99]
  },
  {
    id: 'complete',
    label: 'Завершено',
    description: 'Анализ успешно завершен',
    icon: CheckCircle2,
    keywords: ['завершен'],
    progressRange: [99, 100]
  }
];

// Функция для определения прогресса по сообщению
function getProgressFromMessage(message: string): number {
  if (!message) return 0;
  
  // Подготовка данных - 10%
  if (message.includes('Подготовка данных')) return 10;
  
  // Анализ содержимого договора - от 10% до 70%
  if (message.includes('Анализ содержимого договора')) {
    // Ищем процент в сообщении "Анализ содержимого договора... 45% завершено"
    const percentMatch = message.match(/(\d+)%\s+завершено/);
    if (percentMatch) {
      const messagePercent = parseInt(percentMatch[1]);
      // Масштабируем от 10% до 70% (диапазон 60%)
      return 10 + (messagePercent / 100) * 60;
    }
    return 10; // Начальное значение если процент не найден
  }
  
  // Обработка следующей части договора - промежуточное состояние
  if (message.includes('Обработка следующей части договора')) {
    return 45; // Примерно средний прогресс
  }
  
  // Структурный анализ - 75%
  if (message.includes('структурный анализ')) return 75;
  
  // Поиск отсутствующих требований - 85%
  if (message.includes('отсутствующих требований')) return 85;
  
  // Финализация - 95%
  if (message.includes('Финализация')) return 95;
  
  // Анализ завершен - 100%
  if (message.includes('завершен')) return 100;
  
  return 0;
}

// Функция для определения текущего этапа
function getCurrentStage(message: string): number {
  if (!message) return 0;
  
  if (message.includes('Подготовка данных')) return 0;
  if (message.includes('Анализ содержимого договора') || message.includes('Обработка следующей части договора')) return 1;
  if (message.includes('структурный анализ')) return 2;
  if (message.includes('отсутствующих требований')) return 3;
  if (message.includes('Финализация')) return 4;
  if (message.includes('завершен')) return 5;
  
  return 0;
}

export function AnalysisProgress({ isAnalyzing, progress: progressMessage }: AnalysisProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0);
      setCurrentStage(0);
      return;
    }

    // Обновляем прогресс на основе сообщения
    const newProgress = getProgressFromMessage(progressMessage || '');
    const newStage = getCurrentStage(progressMessage || '');
    
    // Обновляем этап сразу
    setCurrentStage(newStage);
    
    // Плавная анимация прогресса
    let animationFrame: number;
    const animateProgress = () => {
      setProgress(prev => {
        const diff = newProgress - prev;
        if (Math.abs(diff) < 1) {
          return newProgress; // Достигли цели
        }
        // Плавное движение к цели (10% от разности за кадр)
        return prev + diff * 0.1;
      });
      
      // Продолжаем анимацию пока не достигнем цели
      if (Math.abs(newProgress - progress) >= 1) {
        animationFrame = requestAnimationFrame(animateProgress);
      }
    };

    // Запускаем анимацию
    animationFrame = requestAnimationFrame(animateProgress);
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isAnalyzing, progressMessage]);

  // Не показываем если анализ не идет
  if (!isAnalyzing) return null;

  const CurrentIcon = ANALYSIS_STAGES[currentStage]?.icon || Brain;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full mx-4">
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
            <Progress value={progress} className="w-full h-3" />
            <p className="text-sm text-gray-600">
              {Math.round(progress)}% завершено
            </p>
          </div>

          {/* Текущее сообщение */}
          <div className="space-y-4">
            <p className="text-sm font-medium text-orange-600">
              {progressMessage || 'Обработка...'}
            </p>
            
            {/* Все этапы с их статусами */}
            <div className="space-y-3 text-left">
              {ANALYSIS_STAGES.map((stage, index) => {
                const Icon = stage.icon;
                const isCompleted = index < currentStage;
                const isCurrent = index === currentStage;
                
                return (
                  <div
                    key={stage.id}
                    className={`flex items-center space-x-3 p-2 rounded-lg transition-all duration-300 ${
                      isCompleted 
                        ? 'bg-green-50 text-green-700' 
                        : isCurrent 
                          ? 'bg-orange-50 text-orange-700 border-l-4 border-orange-500' 
                          : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <Icon className={`w-5 h-5 ${isCurrent ? 'animate-pulse' : ''}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${isCurrent ? 'font-semibold' : ''}`}>
                          {stage.label}
                        </span>
                        {isCurrent && (
                          <Clock className="w-4 h-4 text-orange-500 animate-pulse" />
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${
                        isCompleted ? 'text-green-600' : 
                        isCurrent ? 'text-orange-600' : 
                        'text-gray-400'
                      }`}>
                        {stage.description}
                      </p>
                    </div>
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