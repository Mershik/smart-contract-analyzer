# Smart Contract Analyzer 📋🤖

Интеллектуальный анализатор договоров на основе ИИ для юридической практики. Приложение использует Google Gemini AI для анализа договоров на соответствие требованиям чек-листа и выявления рисков.

## 🚀 Возможности

- **Анализ соответствия чек-листу**: Проверка договоров на соответствие заданным требованиям
- **Выявление рисков**: Автоматическое обнаружение потенциальных правовых рисков
- **Структурный анализ**: Анализ структуры и полноты договора
- **Экспорт результатов**: Выгрузка результатов анализа в формате DOCX
- **История анализов**: Сохранение и просмотр предыдущих анализов
- **Современный UI**: Красивый и удобный интерфейс на React + Tailwind CSS

## 🛠️ Технологический стек

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Wouter (маршрутизация)
- React Hook Form + Zod
- Framer Motion

**Backend:**
- Node.js + Express
- TypeScript
- Google Gemini AI API
- Drizzle ORM + PostgreSQL

**Инфраструктура:**
- Vite (сборка и разработка)
- ESBuild (production build)

## 📦 Установка

### Предварительные требования

- Node.js 18+ 
- npm или yarn
- PostgreSQL (опционально, для продакшна)

### Локальная разработка

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/your-username/smart-contract-analyzer.git
cd smart-contract-analyzer
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Настройте переменные окружения:**
```bash
# Создайте .env файл в корне проекта
VITE_API_KEY=your_google_gemini_api_key
```

4. **Запустите проект:**
```bash
npm run dev
```

Приложение будет доступно по адресу: `http://localhost:5000`

## 🔧 Настройка Google Gemini API

1. Перейдите в [Google AI Studio](https://makersuite.google.com/)
2. Создайте новый API ключ
3. Добавьте ключ в переменную окружения `VITE_API_KEY`

## 📝 Использование

1. **Загрузите договор** в текстовом формате
2. **Выберите режим анализа:**
   - Анализ по чек-листу
   - Анализ рисков
   - Структурный анализ
3. **Настройте параметры** анализа при необходимости
4. **Запустите анализ** и дождитесь результатов
5. **Экспортируйте результаты** в DOCX формате

## 🚢 Деплой

### Production сборка

```bash
npm run build
npm start
```

### Docker (в разработке)

```bash
docker build -t contract-analyzer .
docker run -p 5000:5000 contract-analyzer
```

## 📁 Структура проекта

```
├── client/              # Frontend React приложение
│   ├── src/
│   │   ├── components/  # React компоненты
│   │   ├── pages/       # Страницы приложения
│   │   ├── lib/         # Утилиты и хелперы
│   │   └── hooks/       # React хуки
├── server/              # Backend Express сервер
│   ├── routes.ts        # API маршруты
│   └── index.ts         # Основной файл сервера
├── shared/              # Общие типы и схемы
└── dist/                # Production сборка
```

## 🏗️ Архитектура и логика работы

### Общая архитектура

Приложение построено по принципу **клиент-серверной архитектуры** с четким разделением ответственности:

```
┌─────────────────┐    HTTP/REST API    ┌─────────────────┐    AI API    ┌─────────────────┐
│   React Client  │ ◄─────────────────► │  Express Server │ ◄──────────► │   Google Gemini │
│   (Frontend)    │                     │   (Backend)     │              │      AI         │
└─────────────────┘                     └─────────────────┘              └─────────────────┘
        │                                        │
        ▼                                        ▼
┌─────────────────┐                     ┌─────────────────┐
│   Local Storage │                     │   File Storage  │
│   (История)     │                     │   (Результаты)  │
└─────────────────┘                     └─────────────────┘
```

### Поток данных и обработка

#### 1. **Загрузка и валидация договора**
```typescript
// client/src/components/contract-input.tsx
const handleFileUpload = (file: File) => {
  // Валидация типа файла (.txt, .docx)
  // Проверка размера (макс. 10MB)
  // Извлечение текста из файла
  // Передача в состояние приложения
}
```

#### 2. **Подготовка запроса к ИИ**
```typescript
// client/src/hooks/use-gemini-analysis.ts
const analyzeContract = async (contractText: string, requirements: string[]) => {
  const prompt = buildAnalysisPrompt({
    contractText,
    requirements,
    analysisType: selectedMode
  });
  
  return await fetch('/api/analysis', {
    method: 'POST',
    body: JSON.stringify({ prompt, contractText })
  });
}
```

#### 3. **Серверная обработка**
```typescript
// server/routes.ts
app.post('/api/analysis', async (req, res) => {
  try {
    // 1. Валидация входных данных
    const { prompt, contractText } = validateRequest(req.body);
    
    // 2. Вызов Google Gemini API
    const aiResponse = await geminiClient.generateContent(prompt);
    
    // 3. Парсинг и структурирование ответа
    const structuredResult = parseAIResponse(aiResponse);
    
    // 4. Сохранение результата
    const analysisId = await saveAnalysis(structuredResult);
    
    // 5. Возврат результата клиенту
    res.json({ success: true, data: structuredResult, id: analysisId });
  } catch (error) {
    handleError(error, res);
  }
});
```

### Типы анализа

#### 🔍 **Анализ по чек-листу**
```typescript
interface ChecklistAnalysis {
  requirements: RequirementCheck[];
  overallCompliance: number;
  criticalIssues: Issue[];
  recommendations: string[];
}

interface RequirementCheck {
  requirement: string;
  status: 'fulfilled' | 'partial' | 'missing' | 'unclear';
  evidence: string[];
  suggestions: string[];
}
```

#### ⚠️ **Анализ рисков**
```typescript
interface RiskAnalysis {
  risks: Risk[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  categories: RiskCategory[];
  mitigation: MitigationStrategy[];
}

interface Risk {
  type: string;
  severity: number;
  probability: number;
  description: string;
  impact: string;
  location: string; // Где в договоре найден риск
}
```

#### 📊 **Структурный анализ**
```typescript
interface StructuralAnalysis {
  completeness: number;
  sections: SectionAnalysis[];
  missingElements: string[];
  structuralIssues: StructuralIssue[];
}

interface SectionAnalysis {
  name: string;
  present: boolean;
  quality: number;
  content: string;
  issues: string[];
}
```

### Система промптов

Приложение использует **модульную систему промптов** для различных типов анализа:

```typescript
// client/src/lib/gemini.ts
const ANALYSIS_PROMPTS = {
  checklist: `
    Проанализируй договор на соответствие следующим требованиям:
    {requirements}
    
    Договор: {contractText}
    
    Верни результат в JSON формате:
    {
      "requirements": [
        {
          "requirement": "название требования",
          "status": "fulfilled|partial|missing|unclear",
          "evidence": ["найденные подтверждения"],
          "suggestions": ["рекомендации по улучшению"]
        }
      ],
      "overallCompliance": число от 0 до 100,
      "summary": "общий вывод"
    }
  `,
  
  risks: `
    Проведи анализ рисков для следующего договора:
    {contractText}
    
    Найди и оцени все потенциальные правовые, финансовые и операционные риски.
    // ... детальный промпт для анализа рисков
  `,
  
  structural: `
    Проанализируй структуру и полноту договора:
    {contractText}
    
    Оцени наличие всех необходимых разделов и элементов.
    // ... детальный промпт для структурного анализа
  `
};
```

### Обработка ошибок

```typescript
// Многоуровневая система обработки ошибок
class AnalysisError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
  }
}

// Типы ошибок:
// - VALIDATION_ERROR: Неверные входные данные
// - AI_API_ERROR: Ошибка Google Gemini API
// - PARSING_ERROR: Ошибка парсинга ответа ИИ
// - STORAGE_ERROR: Ошибка сохранения результатов
```

### Кэширование и оптимизация

```typescript
// Кэширование результатов анализа
const analysisCache = new Map<string, AnalysisResult>();

const getCacheKey = (contractText: string, requirements: string[]) => {
  return crypto
    .createHash('sha256')
    .update(contractText + JSON.stringify(requirements))
    .digest('hex');
};
```

### Экспорт результатов

```typescript
// client/src/lib/docx-export.ts
export const exportToDocx = async (analysis: AnalysisResult) => {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Заголовок отчета
        new Paragraph({
          text: "Отчет об анализе договора",
          heading: HeadingLevel.TITLE
        }),
        
        // Результаты анализа
        ...generateAnalysisContent(analysis),
        
        // Рекомендации
        ...generateRecommendations(analysis.recommendations)
      ]
    }]
  });
  
  return await Packer.toBlob(doc);
};
```

### Безопасность

- **Валидация входных данных** на клиенте и сервере
- **Санитизация** текста договоров перед отправкой в ИИ
- **Ограничение размера** загружаемых файлов
- **Rate limiting** для API запросов
- **Логирование** всех операций для аудита

## 🤝 Содействие

Мы приветствуем вклад в развитие проекта! Пожалуйста:

1. Форкните репозиторий
2. Создайте ветку для новой функции (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 🆘 Поддержка

- Создайте [Issue](https://github.com/your-username/smart-contract-analyzer/issues) для сообщения об ошибках
- Обратитесь к [Wiki](https://github.com/your-username/smart-contract-analyzer/wiki) для дополнительной документации
- Присоединяйтесь к обсуждениям в [Discussions](https://github.com/your-username/smart-contract-analyzer/discussions)

## 🙏 Благодарности

- [Google Gemini AI](https://deepmind.google/technologies/gemini/) за мощный ИИ для анализа текста
- [shadcn/ui](https://ui.shadcn.com/) за прекрасные UI компоненты
- [Tailwind CSS](https://tailwindcss.com/) за удобную стилизацию

---

*Разработано с уважением для юридического сообщества* 