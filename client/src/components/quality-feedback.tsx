import { useState } from 'react';
import { ThumbsUp, MessageSquare, Star } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface QualityFeedbackProps {
  analysisId?: string;
  onSubmitFeedback?: (_feedback: FeedbackData) => void;
}

export interface FeedbackData {
  rating: number;
  accuracy: 'accurate' | 'partially_accurate' | 'inaccurate';
  feedback: string;
  categories: {
    compliance: boolean;
    risks: boolean;
    missing: boolean;
    comments: boolean;
  };
  timestamp: string;
  analysisId?: string;
}

export function QualityFeedback({ analysisId, onSubmitFeedback }: QualityFeedbackProps) {
  const [rating, setRating] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<'accurate' | 'partially_accurate' | 'inaccurate' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [categories, setCategories] = useState({
    compliance: false,
    risks: false,
    missing: false,
    comments: false
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleSubmit = () => {
    if (rating === 0 || !accuracy) {
      alert('Пожалуйста, оцените анализ и его точность');
      return;
    }

    const feedbackData: FeedbackData = {
      rating,
      accuracy,
      feedback,
      categories,
      timestamp: new Date().toISOString(),
      analysisId
    };

    // Сохраняем в localStorage для аналитики
    try {
      const existingFeedback = JSON.parse(localStorage.getItem('analysis_feedback') || '[]');
      existingFeedback.push(feedbackData);
      // Храним только последние 100 отзывов
      if (existingFeedback.length > 100) {
        existingFeedback.splice(0, existingFeedback.length - 100);
      }
      localStorage.setItem('analysis_feedback', JSON.stringify(existingFeedback));
    } catch (error) {
      console.warn('Failed to save feedback:', error);
    }

    onSubmitFeedback?.(feedbackData);
    setIsSubmitted(true);
  };

  const handleCategoryToggle = (category: keyof typeof categories) => {
    setCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  if (isSubmitted) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6 mb-6 bg-green-50">
        <div className="flex items-center space-x-2 text-green-700">
          <ThumbsUp size={20} />
          <span className="font-medium">Спасибо за отзыв!</span>
        </div>
        <p className="text-sm text-green-600 mt-2">
          Ваша оценка сохранена локально и поможет улучшить качество анализа договоров. 
          Посмотреть статистику можно в разделе "Аналитика качества".
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center mb-6">
        <Star className="text-orange-500 mr-3" size={20} />
        <h3 className="text-lg font-semibold text-gray-900">
          Оцените качество анализа
        </h3>
      </div>
      <div className="space-y-4">
        {/* Рейтинг */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Общая оценка
          </label>
          <div className="flex space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`p-1 ${
                  star <= rating ? 'text-yellow-400' : 'text-gray-300'
                } hover:text-yellow-400 transition-colors`}
              >
                <Star size={24} fill={star <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
        </div>

        {/* Точность */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Точность анализа
          </label>
          <div className="space-y-2">
            {[
              { value: 'accurate', label: 'Точный анализ', color: 'green' },
              { value: 'partially_accurate', label: 'Частично точный', color: 'yellow' },
              { value: 'inaccurate', label: 'Неточный анализ', color: 'red' }
            ].map((option) => (
              <label key={option.value} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  value={option.value}
                  checked={accuracy === option.value}
                  onChange={(e) => setAccuracy(e.target.value as typeof accuracy)}
                  className="form-radio"
                />
                <span className="text-sm">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Детальная оценка */}
        <div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-orange-600 hover:text-orange-700 underline"
          >
            {showDetails ? 'Скрыть детали' : 'Детальная оценка'}
          </button>
          
          {showDetails && (
            <div className="mt-3 space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Проблемные категории:
              </label>
              {[
                { key: 'compliance', label: 'Определение соответствия' },
                { key: 'risks', label: 'Выявление рисков' },
                { key: 'missing', label: 'Поиск недостающих требований' },
                { key: 'comments', label: 'Качество комментариев' }
              ].map((category) => (
                <label key={category.key} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={categories[category.key as keyof typeof categories]}
                    onChange={() => handleCategoryToggle(category.key as keyof typeof categories)}
                    className="form-checkbox"
                  />
                  <span className="text-sm">{category.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Комментарий */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Дополнительные комментарии
          </label>
          <Textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Поделитесь своими наблюдениями о качестве анализа..."
            className="h-20"
          />
        </div>

        {/* Кнопка отправки */}
        <Button
          onClick={handleSubmit}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white"
          disabled={rating === 0 || !accuracy}
        >
          <MessageSquare size={16} className="mr-2" />
          Отправить отзыв
        </Button>
      </div>
    </div>
  );
} 