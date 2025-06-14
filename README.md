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