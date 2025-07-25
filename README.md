# AI Скрепка - Анализатор договоров поставки 📋🤖

Интеллектуальный анализатор договоров поставки на основе Google Gemini AI для юридической практики. Система проводит многоэтапный анализ договоров с точки зрения покупателя или поставщика, выявляя риски, противоречия и дисбаланс прав.

🔗 **Телеграм-канал**: [AI Скрепка: Связь Права и Технологий](https://t.me/+plgepYs_y0M3ODJi)

## 🚀 Основные возможности

### 📊 Многоэтапный анализ договоров (8 этапов)
1. **Подготовка данных и разбивка на чанки** - Интеллектуальная сегментация текста
2. **Анализ содержимого договора** - Параллельная обработка с использованием пула API ключей
3. **Поиск отсутствующих требований** - Сравнение с корпоративными стандартами
4. **Выявление противоречий** - Поиск конфликтующих условий между пунктами
5. **Анализ дисбаланса прав** - Оценка распределения прав между сторонами
6. **Поиск структурных дефектов** - Выявление проблем в структуре договора
7. **Итоговый структурный анализ** - Комплексная оценка с учетом всех найденных проблем
8. **Финализация результатов** - Формирование итогового отчета

### 🎯 Анализ с двух перспектив
- **Покупатель**: Защита интересов покупателя, контроль рисков поставки
- **Поставщик**: Защита интересов поставщика, минимизация обязательств

### 📋 Детальная категоризация результатов
- **✅ Соответствие требованиям** - Выполненные пункты чек-листа
- **⚠️ Частичное соответствие** - Неполно выполненные требования
- **❌ Выявленные риски** - Потенциально опасные условия
- **❓ Неоднозначные условия** - Требующие уточнения формулировки
- **📋 Отсутствующие требования** - Недостающие обязательные условия
- **⚡ Противоречия** - Конфликтующие пункты договора
- **⚖️ Дисбаланс прав** - Неравномерное распределение прав между сторонами

### 🔧 Дополнительные функции
- **Экспорт в DOCX** - Выгрузка результатов анализа
- **Интерактивные фильтры** - Настройка отображения результатов
- **Оглавление с навигацией** - Быстрый переход к разделам
- **Развертывание длинных текстов** - Удобное чтение полных пунктов
- **Сохранение истории анализов** - Кэширование результатов

## 🛠️ Технологический стек

**Frontend:**
- React 18 + TypeScript
- Vite (сборка и разработка)
- Tailwind CSS + shadcn/ui компоненты
- Wouter (клиентская маршрутизация)
- TanStack Query (управление состоянием)
- Lucide React (иконки)

**Backend:**
- Node.js + Express + TypeScript
- Google Gemini AI API (с поддержкой пула ключей)
- Система кэширования анализов

**Инфраструктура:**
- Vite (сборка и разработка)
- ESBuild (production build)

## 📦 Установка

### Предварительные требования

- Node.js 18+
- npm или yarn  
- Google Gemini API ключ(и)

### Локальная разработка

1. **Клонируйте репозиторий:**
```bash
git clone https://github.com/Mershik/smart-contract-analyzer.git
cd smart-contract-analyzer
```

2. **Установите зависимости:**
```bash
npm install
```

3. **Настройте переменные окружения:**
```bash
cp env.example .env
```

Отредактируйте `.env` файл:
```env
# Google Gemini API ключи (можно указать несколько через запятую для увеличения лимитов)
VITE_API_KEY=your_gemini_api_key_1,your_gemini_api_key_2

# Опционально: настройки для разработки
NODE_ENV=development
```

4. **Запустите приложение:**

Для разработки:
```bash
npm run dev
```

Для продакшена:
```bash
npm run build
npm start
```

Приложение будет доступно по адресу: `http://localhost:5001`

## 🔧 Настройка Google Gemini API

1. Перейдите в [Google AI Studio](https://aistudio.google.com/)
2. Создайте новый API ключ
3. Добавьте ключ(и) в переменную окружения `VITE_API_KEY`
4. Для увеличения лимитов можно использовать несколько ключей через запятую

## 📝 Использование

### Пошаговая инструкция

1. **Введите текст договора** в текстовое поле или загрузите пример
2. **Выберите перспективу анализа:**
   - 👤 **Покупатель** - анализ с точки зрения защиты интересов покупателя
   - 🏢 **Поставщик** - анализ с точки зрения защиты интересов поставщика
3. **Настройте чек-лист требований** (автоматически подставляется в зависимости от перспективы)
4. **Настройте список рисков** (автоматически подставляется в зависимости от перспективы)
5. **Запустите анализ** - система проведет 8-этапный анализ договора
6. **Изучите результаты:**
   - Структурный анализ договора
   - Детальный анализ пунктов с категоризацией
   - Отсутствующие требования
   - Выявленные противоречия
   - Дисбаланс прав между сторонами
7. **Используйте фильтры** для настройки отображения результатов
8. **Экспортируйте результаты** в DOCX формате

### Интерфейс

- **Оглавление** - быстрая навигация по разделам анализа
- **Фильтры** - настройка отображения категорий результатов
- **Развертывание текстов** - клик по длинным пунктам для полного просмотра
- **Автоматическая прокрутка** - к результатам после завершения анализа

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
smart-contract-analyzer/
├── client/                          # Frontend приложение
│   ├── src/
│   │   ├── components/              # React компоненты
│   │   │   ├── ui/                  # shadcn/ui компоненты
│   │   │   ├── analysis-progress.tsx        # Индикатор прогресса анализа
│   │   │   ├── analysis-results.tsx         # Результаты анализа пунктов
│   │   │   ├── contradictions-results.tsx   # Блок противоречий
│   │   │   ├── rights-imbalance-results.tsx # Блок дисбаланса прав
│   │   │   ├── structural-analysis.tsx      # Структурный анализ
│   │   │   ├── table-of-contents.tsx        # Оглавление с навигацией
│   │   │   ├── floating-filters.tsx         # Интерактивные фильтры
│   │   │   └── ...                          # Другие компоненты
│   │   ├── hooks/                   # Custom React hooks
│   │   │   ├── use-gemini-analysis.ts       # Хук для анализа с Gemini
│   │   │   └── use-mobile.tsx               # Хук для мобильной адаптации
│   │   ├── lib/                     # Утилиты и библиотеки
│   │   │   ├── gemini.ts                    # Основная логика анализа с Gemini
│   │   │   ├── docx-export.ts               # Экспорт в DOCX
│   │   │   └── utils.ts                     # Вспомогательные функции
│   │   ├── pages/                   # Страницы приложения
│   │   │   ├── contract-analyzer.tsx        # Основная страница анализатора
│   │   │   ├── analytics.tsx                # Страница аналитики
│   │   │   └── not-found.tsx                # 404 страница
│   │   ├── App.tsx                  # Корневой компонент
│   │   └── main.tsx                 # Точка входа
│   ├── index.html                   # HTML шаблон
│   └── my-app/                      # Next.js приложение (не используется)
├── server/                          # Backend Express сервер (опционально, для расширения)
├── shared/                          # Общие типы и схемы
│   └── schema.ts                    # TypeScript типы и Zod схемы
├── dist/                            # Собранное приложение
├── package.json                     # Зависимости и скрипты
├── vite.config.ts                   # Конфигурация Vite
├── tailwind.config.ts               # Конфигурация Tailwind CSS
└── tsconfig.json                    # Конфигурация TypeScript
```

## 🏗️ Логика работы

### Многоэтапный анализ договоров

Система проводит **8-этапный анализ** с использованием продвинутых техник обработки:

```
📄 Договор → 🔄 Чанкинг → 🤖 AI Анализ → 📊 Агрегация → 📋 Результаты
     │            │           │              │             │
     ▼            ▼           ▼              ▼             ▼
  Текст      Разбивка на   Параллельная   Сборка и    Структурированный
 договора     смысловые    обработка с    анализ        отчет с
              блоки        пулом ключей   результатов   категоризацией
```

### Ключевые особенности реализации

#### 1. **Интеллектуальная разбивка на чанки**
```typescript
// client/src/lib/gemini.ts
function createChunksWithTokens(paragraphs, maxTokens, overlapSentences) {
  // Разбивка договора на смысловые блоки с учетом:
  // • Максимального количества токенов (600 на чанк)
  // • Перекрытия между чанками (2 предложения)
  // • Сохранения контекста между блоками
}
```

#### 2. **Пул API ключей с балансировкой нагрузки**
```typescript
// client/src/lib/gemini.ts
class ApiKeyPool {
  // Round-robin распределение запросов
  // Автоматическое исключение исчерпанных ключей
  // Мониторинг использования каждого ключа
  // Логирование статистики использования
}
```

#### 3. **Параллельная обработка чанков**
```typescript
// client/src/lib/gemini.ts
async function processChunksInParallel(chunks, checklist, risks, perspective) {
  // Батчевая обработка (по 8 чанков одновременно)
  // Контролируемые задержки между батчами
  // Обработка ошибок и повторные попытки
  // Индикация прогресса в реальном времени
}
```

#### 4. **Многоэтапный анализ**
```typescript
// client/src/lib/gemini.ts
export async function analyzeContractWithGemini(contractText, checklist, risks, perspective) {
  // Этап 1: Подготовка данных и разбивка на чанки
  // Этап 2: Анализ содержимого договора (параллельно)
  // Этап 3: Поиск отсутствующих требований
  // Этап 4: Выявление противоречий между пунктами
  // Этап 5: Анализ дисбаланса прав между сторонами
  // Этап 6: Поиск структурных дефектов
  // Этап 7: Итоговый структурный анализ
  // Этап 8: Финализация результатов
}
```

## ✨ Последние обновления

### v2.0.0 - Многоэтапный анализ и исправление противоречий

#### 🔧 Исправления
- **Исправлено отображение противоречий**: Теперь в блоке "Выявленные противоречия" показываются полные тексты пунктов договора вместо сокращенных версий
- **Улучшена точность анализа**: AI получает полные тексты для более качественного выявления противоречий
- **Оптимизированы промпты**: Увеличены лимиты для описаний и рекомендаций

#### 🚀 Новые возможности
- **8-этапный анализ договоров**: Комплексная система анализа с детальной индикацией прогресса
- **Пул API ключей**: Поддержка нескольких Gemini API ключей для увеличения лимитов и надежности
- **Параллельная обработка**: Батчевая обработка чанков договора с контролируемым параллелизмом
- **Интеллектуальная разбивка**: Продвинутая сегментация текста с учетом токенов и контекста
- **Анализ дисбаланса прав**: Подход "Извлеки-и-пометь" для оценки распределения прав между сторонами
- **Поиск структурных дефектов**: Выявление проблем в структуре и оформлении договора

#### 🎨 Улучшения UI/UX
- **Развертывание длинных текстов**: Клик по длинным пунктам для просмотра полного содержания
- **Интерактивные фильтры**: Настройка отображения различных категорий результатов
- **Оглавление с навигацией**: Быстрый переход к разделам анализа
- **Автоматическая прокрутка**: К результатам после завершения анализа
- **Индикатор прогресса**: Детальное отображение этапов анализа в реальном времени



## 🔧 Доступные команды

```bash
# Разработка
npm run dev          # Запуск в режиме разработки
npm run build        # Сборка для продакшена
npm start           # Запуск продакшен версии

# Качество кода
npm run check       # Проверка TypeScript
npm run lint        # Проверка ESLint
npm run lint:fix    # Исправление ESLint ошибок
```

## 🤝 Содействие

Я приветствую вклад в развитие проекта! 

### Как помочь проекту:

1. **Сообщите об ошибке** - создайте issue с подробным описанием или написать в телеграмм канале
2. **Предложите улучшение** - опишите новую функциональность в телеграм-канале
3. **Тестирование** - попробуйте приложение и поделитесь отзывом
4. **Распространение** - расскажите коллегам-юристам о проекте

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).

## 👨‍💻 Автор

**Мирошниченко Евгений**
- Старший юрист и энтузиаст новых технологий
- Телеграм-канал: [AI Скрепка: Связь Права и Технологий](https://t.me/+plgepYs_y0M3ODJi)
- GitHub: [@Mershik](https://github.com/Mershik)

## 🙏 Благодарности

- [Google Gemini AI](https://ai.google.dev/) за предоставление мощного API для анализа текста
- [React](https://reactjs.org/) и [Vite](https://vitejs.dev/) командам за отличные инструменты разработки
- [Tailwind CSS](https://tailwindcss.com/) и [shadcn/ui](https://ui.shadcn.com/) за удобную систему компонентов
- Юридическому и ИТ сообществам за обратную связь и тестирование

## 🔗 Полезные ссылки

- **Телеграм-канал**: [AI Скрепка: Связь Права и Технологий](https://t.me/+plgepYs_y0M3ODJi)
- **Google AI Studio**: [Получить API ключ](https://aistudio.google.com/)


---

⭐ **Если проект оказался полезным, поставьте звездочку на GitHub и подпишитесь на телеграм-канал!**

*Разработано с уважением для юридического сообщества* 
