import { useState, useEffect } from 'react';
import { BarChart3, AlertTriangle, CheckCircle, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { FeedbackData } from './quality-feedback';

interface AnalyticsData {
  totalAnalyses: number;
  averageRating: number;
  accuracyBreakdown: {
    accurate: number;
    partially_accurate: number;
    inaccurate: number;
  };
  commonIssues: {
    category: string;
    count: number;
  }[];
  recentFeedback: FeedbackData[];
  errorLogs: any[];
}

export function AnalyticsDashboard() {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    totalAnalyses: 0,
    averageRating: 0,
    accuracyBreakdown: { accurate: 0, partially_accurate: 0, inaccurate: 0 },
    commonIssues: [],
    recentFeedback: [],
    errorLogs: []
  });

  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = () => {
    try {
      // Загружаем отзывы
      const feedback = JSON.parse(localStorage.getItem('analysis_feedback') || '[]') as FeedbackData[];
      
      // Загружаем логи ошибок
      const errorLogs = JSON.parse(localStorage.getItem('gemini_error_logs') || '[]');

      // Вычисляем статистику
      const totalAnalyses = feedback.length;
      const averageRating = feedback.length > 0 
        ? feedback.reduce((sum, f) => sum + f.rating, 0) / feedback.length 
        : 0;

      const accuracyBreakdown = feedback.reduce(
        (acc, f) => ({ ...acc, [f.accuracy]: acc[f.accuracy] + 1 }),
        { accurate: 0, partially_accurate: 0, inaccurate: 0 }
      );

      // Анализируем проблемные категории
      const issueCounters: { [key: string]: number } = {};
      feedback.forEach(f => {
        Object.entries(f.categories).forEach(([category, hasIssue]) => {
          if (hasIssue) {
            issueCounters[category] = (issueCounters[category] || 0) + 1;
          }
        });
      });

      const commonIssues = Object.entries(issueCounters)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      setAnalyticsData({
        totalAnalyses,
        averageRating,
        accuracyBreakdown,
        commonIssues,
        recentFeedback: feedback.slice(-10),
        errorLogs: errorLogs.slice(-10)
      });
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    }
  };

  const exportData = () => {
    const data = {
      ...analyticsData,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearData = () => {
    if (confirm('Вы уверены, что хотите очистить все данные аналитики?')) {
      localStorage.removeItem('analysis_feedback');
      localStorage.removeItem('gemini_error_logs');
      loadAnalyticsData();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Аналитика качества</h2>
        <div className="space-x-2">
          <Button variant="outline" onClick={loadAnalyticsData}>
            Обновить
          </Button>
          <Button variant="outline" onClick={exportData}>
            Экспорт
          </Button>
          <Button variant="outline" onClick={clearData}>
            Очистить
          </Button>
        </div>
      </div>

      {/* Основные метрики */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Всего анализов</p>
                <p className="text-2xl font-bold">{analyticsData.totalAnalyses}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Средний рейтинг</p>
                <p className="text-2xl font-bold">{analyticsData.averageRating.toFixed(1)}</p>
              </div>
              <Star className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Точных анализов</p>
                <p className="text-2xl font-bold">{analyticsData.accuracyBreakdown.accurate}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Ошибок</p>
                <p className="text-2xl font-bold">{analyticsData.errorLogs.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Детальная статистика */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Распределение точности */}
        <Card>
          <CardHeader>
            <CardTitle>Распределение точности</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analyticsData.accuracyBreakdown).map(([type, count]) => {
                const total = analyticsData.totalAnalyses || 1;
                const percentage = (count / total) * 100;
                const colors = {
                  accurate: 'bg-green-500',
                  partially_accurate: 'bg-yellow-500',
                  inaccurate: 'bg-red-500'
                };
                const labels = {
                  accurate: 'Точные',
                  partially_accurate: 'Частично точные',
                  inaccurate: 'Неточные'
                };

                return (
                  <div key={type} className="flex items-center space-x-3">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span>{labels[type as keyof typeof labels]}</span>
                        <span>{count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className={`${colors[type as keyof typeof colors]} h-2 rounded-full`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Частые проблемы */}
        <Card>
          <CardHeader>
            <CardTitle>Частые проблемы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analyticsData.commonIssues.map((issue) => {
                const labels = {
                  compliance: 'Определение соответствия',
                  risks: 'Выявление рисков',
                  missing: 'Поиск недостающих требований',
                  comments: 'Качество комментариев'
                };

                return (
                  <div key={issue.category} className="flex justify-between items-center">
                    <span className="text-sm">{labels[issue.category as keyof typeof labels]}</span>
                    <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
                      {issue.count}
                    </span>
                  </div>
                );
              })}
              {analyticsData.commonIssues.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  Нет данных о проблемах
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Детальные данные */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Детальные данные</span>
            <Button
              variant="outline"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? 'Скрыть' : 'Показать'}
            </Button>
          </CardTitle>
        </CardHeader>
        {showDetails && (
          <CardContent>
            <div className="space-y-6">
              {/* Последние отзывы */}
              <div>
                <h4 className="font-medium mb-3">Последние отзывы</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {analyticsData.recentFeedback.map((feedback, index) => (
                    <div key={index} className="border rounded p-3 text-sm">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">Рейтинг: {feedback.rating}/5</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            feedback.accuracy === 'accurate' ? 'bg-green-100 text-green-800' :
                            feedback.accuracy === 'partially_accurate' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {feedback.accuracy}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(feedback.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      {feedback.feedback && (
                        <p className="mt-2 text-gray-600">{feedback.feedback}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Последние ошибки */}
              <div>
                <h4 className="font-medium mb-3">Последние ошибки</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {analyticsData.errorLogs.map((error, index) => (
                    <div key={index} className="border border-red-200 rounded p-3 text-sm bg-red-50">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-red-800">{error.errorMessage}</span>
                        <span className="text-xs text-red-600">
                          {new Date(error.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-red-600">
                        Контракт: {error.contractLength} символов, 
                        Чек-лист: {error.checklistLength} символов
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
} 