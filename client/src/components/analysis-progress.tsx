import { useState, useEffect } from 'react';
import { Progress } from "@/components/ui/progress";
import { Brain, FileText, Search, CheckCircle2, Zap, Clock } from "lucide-react";

interface AnalysisProgressProps {
  isAnalyzing: boolean;
  onComplete?: () => void;
  progress?: string;
}

// Обновленный список этапов анализа
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
    progressRange: [10, 50]
  },
  {
    id: 'structure',
    label: 'Структурный анализ',
    description: 'Оценка общей структуры и полноты договора',
    icon: Search,
    keywords: ['структурный анализ'],
    progressRange: [50, 60]
  },
  {
    id: 'requirements',
    label: 'Поиск отсутствующих требований',
    description: 'Выявление отсутствующих обязательных условий',
    icon: Search,
    keywords: ['отсутствующих требований'],
    progressRange: [60, 70]
  },
  {
    id: 'contradictions',
    label: 'Поиск противоречий',
    description: 'Поиск противоречий между пунктами договора',
    icon: Clock,
    keywords: ['противоречий'],
    progressRange: [70, 80]
  },
  {
    id: 'imbalance',
    label: 'Анализ дисбаланса прав',
    description: 'Анализ дисбаланса прав сторон',
    icon: Zap,
    keywords: ['дисбаланса прав'],
    progressRange: [80, 95]
  },
  {
    id: 'finalization',
    label: 'Финализация',
    description: 'Объединение результатов и подготовка отчета',
    icon: Zap,
    keywords: ['Финализация'],
    progressRange: [95, 100]
  },
  {
    id: 'complete',
    label: 'Завершено',
    description: 'Анализ успешно завершен',
    icon: CheckCircle2,
    keywords: ['завершен'],
    progressRange: [100, 100]
  }
];

// Функция для определения прогресса по сообщению
function getProgressFromMessage(message: string): number {
  if (!message) return 0;
  // Поиск этапа по ключевым словам
  for (const stage of ANALYSIS_STAGES) {
    for (const keyword of stage.keywords) {
      if (message.includes(keyword)) {
        // Для этапа "Анализ содержимого" учитываем процент
        if (stage.id === 'content') {
          const percentMatch = message.match(/(\d+)%\s+завершено/);
          if (percentMatch) {
            const messagePercent = parseInt(percentMatch[1]);
            // Масштабируем от 10% до 50%
            return 10 + (messagePercent / 100) * 40;
          }
        }
        // Для остальных этапов — возвращаем начало диапазона
        return stage.progressRange[0];
      }
    }
  }
  // Если "завершен" явно — 100%
  if (message.includes('завершен')) return 100;
  return 0;
}

// Функция для определения текущего этапа
function getCurrentStage(message: string): number {
  if (!message) return 0;
  for (let i = 0; i < ANALYSIS_STAGES.length; i++) {
    for (const keyword of ANALYSIS_STAGES[i].keywords) {
      if (message.includes(keyword)) {
        return i;
      }
    }
  }
  if (message.includes('завершен')) return ANALYSIS_STAGES.length - 1;
  return 0;
}

export function AnalysisProgress({ isAnalyzing, progress: progressMessage }: AnalysisProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [animationStart, setAnimationStart] = useState<number | null>(null);
  const [animationFrom, setAnimationFrom] = useState(0);
  const [animationTo, setAnimationTo] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setProgress(0);
      setCurrentStage(0);
      setAnimating(false);
      setAnimationStart(null);
      return;
    }
    const newProgress = getProgressFromMessage(progressMessage || '');
    const newStage = getCurrentStage(progressMessage || '');
    setCurrentStage(newStage);
    // Если прогресс меняется — анимируем минимум 1 секунду
    if (Math.abs(newProgress - progress) > 0.5) {
      setAnimating(true);
      setAnimationStart(performance.now());
      setAnimationFrom(progress);
      setAnimationTo(newProgress);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnalyzing, progressMessage]);

  useEffect(() => {
    if (!animating) return;
    let raf: number;
    const duration = 1000; // минимум 1 секунда
    const start = animationStart || performance.now();
    const from = animationFrom;
    const to = animationTo;
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const value = from + (to - from) * t;
      setProgress(value);
      if (t < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        setProgress(to);
        setAnimating(false);
      }
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [animating, animationStart, animationFrom, animationTo]);

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
          {/* Этапы анализа */}
          <div className="space-y-3 text-left mt-6">
            {ANALYSIS_STAGES.map((stage, index) => {
              const Icon = stage.icon;
              const isCompleted = index < currentStage;
              const isCurrent = index === currentStage;
              return (
                <div
                  key={stage.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg transition-all duration-300
                    ${isCompleted ? 'bg-green-50 text-green-700' :
                      isCurrent ? 'bg-orange-50 text-orange-700 border-l-4 border-orange-500' :
                        'bg-gray-50 text-gray-500'}
                  `}
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
                      <span className={`text-sm font-medium ${isCurrent ? 'font-semibold' : ''}`}>{stage.label}</span>
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
  );
} 