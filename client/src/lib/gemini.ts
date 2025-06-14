import { GoogleGenerativeAI } from "@google/generative-ai";
import { analysisResponseSchema, type ContractParagraph, type AnalysisResponse } from "@shared/schema";

let API_KEY = "";
const MODEL_NAME = 'gemini-2.0-flash';

// Функция для получения ключа API
async function getApiKey() {
  if (API_KEY) return API_KEY;
  try {
    console.log('Fetching API key from server...');
    const response = await fetch('/api/gemini-key');
    if (!response.ok) {
      throw new Error(`Failed to fetch API key: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    if (!data.apiKey) {
      throw new Error('API key not found in server response');
    }
    API_KEY = data.apiKey;
    console.log('API key successfully retrieved');
    return API_KEY;
  } catch (error) {
    console.error('Error fetching API key:', error);
    throw new Error('Gemini API key is not configured');
  }
}

// Разбивка договора на абзацы
function splitIntoSpans(text: string): Array<{ id: string; text: string }> {
  const lines = text.split(/\n/);
  const paragraphs: string[] = [];
  let currentParagraph = '';

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
    } else if (/^\d+\./.test(trimmedLine) || /^\d+\.\d+\./.test(trimmedLine)) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = trimmedLine;
    } else {
      currentParagraph += (currentParagraph ? ' ' : '') + trimmedLine;
    }
  }
  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }
  return paragraphs
    .filter(p => p.length > 10)
    .map((paragraph, index) => ({
      id: `p${index + 1}`,
      text: paragraph,
    }));
}

export async function analyzeContractWithGemini(
  contractText: string,
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier' = 'buyer'
): Promise<{ contractParagraphs: ContractParagraph[], missingRequirements: ContractParagraph[], ambiguousConditions: ContractParagraph[], structuralAnalysis: any }> {
  const api_key = import.meta.env.VITE_API_KEY;
  if (!api_key) {
    throw new Error("VITE_API_KEY не установлен");
  }

  const genAI = new GoogleGenerativeAI(api_key);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,  // Более быстрая и менее ограниченная версия
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.

ВАЖНЫЕ ПРАВИЛА КАТЕГОРИЗАЦИИ:

1. "checklist" - если абзац ПОЛНОСТЬЮ СООТВЕТСТВУЕТ или ПРЕВЫШАЕТ требования из чек-листа ${perspective === 'buyer' ? 'требования Покупателя' : 'требования Поставщика'}

2. "partial" - если абзац ЧАСТИЧНО соответствует требованиям чек-листа, но НЕ ДОСТИГАЕТ их полностью.
   
   ВАЖНО: Если параметры в договоре ЛУЧШЕ или РАВНЫ требованиям, то это категория checklist, НЕ partial!
   
   Категория 'partial' обрабатывает только случаи когда условие в договоре НЕ ДОСТИГАЕТ требований чек-листа:
   • Параметры хуже требований (сроки короче, суммы меньше)
   • Неполные формулировки
   • Условные соответствия с оговорками
   • Близкие но недостаточные условия
   
   ПРИМЕРЫ ЧАСТИЧНОГО СООТВЕТСТВИЯ:
   • Гарантия 6 месяцев при требовании "не менее 12 месяцев" = ЧАСТИЧНОЕ (6 < 12)
   • Срок поставки 45 дней при требовании "не более 30 дней" = ЧАСТИЧНОЕ (45 > 30)
   • Предоплата 60% при требовании "не более 30%" = ЧАСТИЧНОЕ (60% > 30%)

3. "risk" - если абзац содержит условие, которое ПРЯМО УПОМЯНУТО в списке ${perspective === 'buyer' ? 'риски для Покупателя' : 'риски для Поставщика'}

4. null - для всех остальных абзацев (стандартные условия, обычные формулировки, технические детали)

КРИТИЧЕСКИ ВАЖНО:
- Для категорий null НЕ ЗАПОЛНЯЙ поля comment, recommendation, improvedClause, legalRisk
- Детальный анализ проводи ТОЛЬКО для категорий: checklist, partial, risk, missing
- Для обычных пунктов договора (адреса, реквизиты, стандартные формулировки) ставь category: null и все остальные поля: null

ТРЕБОВАНИЯ К ФОРМУЛИРОВКАМ (только для релевантных категорий):
• Улучшенные формулировки должны быть юридически корректными по российскому праву
• Рекомендации должны быть практичными и выполнимыми
• Правовые риски должны ссылаться на конкретные нормы ГК РФ где возможно
• Все предложения должны соответствовать российской правоприменительной практике`
  });

  const paragraphs = splitIntoSpans(contractText);

  const perspectiveContext = perspective === 'buyer'
    ? {
        role: 'Покупателя',
        requirements: 'требования Покупателя',
        risks: 'риски для Покупателя',
        attention: 'требуют внимания Покупателя',
        missing: 'отсутствующих требований Покупателя',
        beneficiary: 'покупателя'
      }
    : {
        role: 'Поставщика', 
        requirements: 'требования Поставщика',
        risks: 'риски для Поставщика',
        attention: 'требуют внимания Поставщика',
        missing: 'отсутствующих требований Поставщика',
        beneficiary: 'поставщика'
      };

  const userPrompt = `Ты - AI-ассистент юриста, специализирующийся на анализе договоров поставки в соответствии с законодательством РФ (Гражданский кодекс РФ, ФЗ "О поставках товаров для государственных нужд", иные нормативные акты).

ЭТАП 1: СТРУКТУРНЫЙ АНАЛИЗ ДОГОВОРА

Сначала изучи весь договор ЦЕЛИКОМ для понимания:
- Общей структуры и логики договора
- Соответствия российскому законодательству
- Взаимосвязей между разделами
- Потенциальных противоречий между пунктами
- Ключевых рисков с позиции ${perspectiveContext.role}

ВАЖНО ДЛЯ НЕОДНОЗНАЧНЫХ УСЛОВИЙ В СТРУКТУРНОМ АНАЛИЗЕ:
Включай в список ambiguousConditions ТОЛЬКО действительно проблемные условия:
• Условия с неопределенными параметрами ("разумный срок", "при необходимости")
• Формулировки с множественной трактовкой без процедуры разрешения
• Условия с отсутствующими ключевыми деталями
• Противоречия между разными частями договора
• Условия, где невозможно определить права и обязанности сторон

НЕ включай стандартные юридические формулировки, ссылки на законодательство, типовые условия договоров.

ЭТАП 2: ДЕТАЛЬНЫЙ АНАЛИЗ ПО АБЗАЦАМ

Затем проанализируй каждый абзац с позиции ${perspectiveContext.role.toUpperCase()}.

ВАЖНО: Для пунктов, НЕ ОТНОСЯЩИХСЯ к чек-листу или рискам, указывай только:
- id
- category: null
- comment: null
- recommendation: null
- improvedClause: null
- legalRisk: null

ПОЛНЫЙ анализ (с комментариями, рекомендациями, улучшенными формулировками) проводи ТОЛЬКО для пунктов, которые:
1. Соответствуют требованиям из чек-листа (category: "checklist" или "partial")
2. Содержат риски из списка рисков (category: "risk") 
3. Отсутствуют в договоре, но требуются (category: "missing")

Чек-лист ${perspectiveContext.requirements}:
${checklistText}

РАЗБОР ПРИМЕРОВ ИЗ ЧЕК-ЛИСТА:
• "Срок поставки не более 30 дней" → 25 дней = ХОРОШО (25 ≤ 30)
• "Гарантийный срок не менее 12 месяцев" → 18 месяцев = ХОРОШО (18 ≥ 12)  
• "Предоплата не более 30%" → 60% = ПЛОХО (60% > 30%)
• "Штрафные санкции не менее 0.1% в день" → 0.05% = ПЛОХО (0.05% < 0.1%)

---
Список рисков для ${perspectiveContext.role}:
${riskText}

---
ПОЛНЫЙ ТЕКСТ ДОГОВОРА ДЛЯ СТРУКТУРНОГО АНАЛИЗА:
${contractText}

---
ДОГОВОР РАЗБИТЫЙ НА АБЗАЦЫ ДЛЯ ДЕТАЛЬНОГО АНАЛИЗА:
${JSON.stringify(paragraphs)}

---
Требуемый JSON-ответ:
{
  "structuralAnalysis": {
    "overallAssessment": "Общая оценка договора с позиции ${perspectiveContext.role}",
    "keyRisks": ["Основной риск 1", "Основной риск 2", "Основной риск 3"],
    "ambiguousConditions": ["Неоднозначное условие 1", "Неоднозначное условие 2"],
    "structureComments": "Комментарии по структуре и логике договора",
    "legalCompliance": "Оценка соответствия российскому законодательству",
    "recommendations": ["Рекомендация 1", "Рекомендация 2", "Рекомендация 3"]
  },
  "analysis": [
    {
      "id": "p1",
      "category": "checklist",
      "comment": "Детальная оценка ТОЛЬКО для релевантных пунктов",
      "recommendation": "Что рекомендуется сделать ТОЛЬКО для релевантных пунктов",
      "improvedClause": "Улучшенная формулировка ТОЛЬКО для релевантных пунктов",
      "legalRisk": "Правовые риски ТОЛЬКО для релевантных пунктов"
    },
    {
      "id": "p2",
      "category": null,
      "comment": null,
      "recommendation": null,
      "improvedClause": null,
      "legalRisk": null
    }
  ],
  "missingRequirements": [
    {
      "requirement": "Отсутствующее требование из чек-листа",
      "comment": "Объяснение важности",
      "recommendation": "Как добавить это требование в договор"
    }
  ],
  "ambiguousConditions": [
    {
      "condition": "Неоднозначное условие",
      "paragraphId": "p5",
      "comment": "Почему это условие неоднозначно",
      "recommendation": "Как уточнить формулировку"
    }
  ]
}

ПРАВИЛА КАТЕГОРИЗАЦИИ АБЗАЦЕВ С ПОЗИЦИИ ${perspectiveContext.role.toUpperCase()}:

1. "checklist" - если абзац ПОЛНОСТЬЮ СООТВЕТСТВУЕТ или ПРЕВЫШАЕТ требования из чек-листа ${perspectiveContext.role}
   ПРИМЕРЫ ПОЛНОГО СООТВЕТСТВИЯ:
   • Гарантия 18 месяцев при требовании "не менее 12 месяцев" = ПОЛНОЕ СООТВЕТСТВИЕ
   • Срок поставки 25 дней при требовании "не более 30 дней" = ПОЛНОЕ СООТВЕТСТВИЕ  
   • Предоплата 20% при требовании "не более 30%" = ПОЛНОЕ СООТВЕТСТВИЕ

2. "partial" - если абзац ЧАСТИЧНО СООТВЕТСТВУЕТ требованию из чек-листа, но имеет недостатки:
   ВАЖНО: Если параметры в договоре ЛУЧШЕ или РАВНЫ требованиям, то это категория checklist, НЕ partial!
   
   Категория 'partial' обрабатывает только случаи когда условие в договоре НЕ ДОСТИГАЕТ требований чек-листа:
   • Параметры хуже требований (сроки короче, суммы меньше)
   • Неполные формулировки
   • Условные соответствия с оговорками
   • Близкие но недостаточные условия
   
   ПРИМЕРЫ ЧАСТИЧНОГО СООТВЕТСТВИЯ:
   • Гарантия 6 месяцев при требовании "не менее 12 месяцев" = ЧАСТИЧНОЕ (6 < 12)
   • Срок поставки 45 дней при требовании "не более 30 дней" = ЧАСТИЧНОЕ (45 > 30)
   • Предоплата 60% при требовании "не более 30%" = ЧАСТИЧНОЕ (60% > 30%)

3. "risk" - если абзац содержит условие, которое ПРЯМО УПОМЯНУТО в списке ${perspectiveContext.risks}

4. "ambiguous" - если абзац содержит ДЕЙСТВИТЕЛЬНО НЕОДНОЗНАЧНЫЕ условия, которые требуют обязательного уточнения:
   
   СТРОГИЕ КРИТЕРИИ для категории "ambiguous":
   • Условия с НЕОПРЕДЕЛЕННЫМИ параметрами ("разумный срок", "при необходимости", "в случае возможности")
   • Формулировки с МНОЖЕСТВЕННОЙ трактовкой ("по согласованию сторон" без процедуры согласования)
   • Условия с ОТСУТСТВУЮЩИМИ ключевыми деталями (размер штрафа "определяется дополнительно")
   • Противоречивые условия в РАЗНЫХ частях договора
   • Условия, где НЕВОЗМОЖНО определить права и обязанности сторон
   
   НЕ ОТНОСИТЬ к неоднозначным:
   • Стандартные юридические формулировки ("в соответствии с законодательством РФ")
   • Условия с четким указанием приоритета ("применяются условия Спецификации")
   • Ссылки на нормативные документы и ГОСТы
   • Типовые условия договоров поставки
   • Условия с ясным алгоритмом действий
   
   ПРИМЕРЫ ДЕЙСТВИТЕЛЬНО НЕОДНОЗНАЧНЫХ условий:
   • "Поставка осуществляется в разумные сроки" (что такое "разумные"?)
   • "Качество товара должно быть приемлемым" (критерии приемлемости?)
   • "Стороны договорятся о цене позже" (когда? как? что если не договорятся?)
   • "Штраф определяется по обстоятельствам" (какие обстоятельства? кто определяет?)

5. null - для всех остальных абзацев (стандартные условия, обычные формулировки, технические детали)

КРИТИЧЕСКИ ВАЖНО:
- Для категорий null НЕ ЗАПОЛНЯЙ поля comment, recommendation, improvedClause, legalRisk
- Детальный анализ проводи ТОЛЬКО для категорий: checklist, partial, risk, ambiguous, missing
- Для обычных пунктов договора (адреса, реквизиты, стандартные формулировки) ставь category: null и все остальные поля: null
- Неоднозначные условия должны выявляться ПРЯМО В ТЕКСТЕ ДОГОВОРА (category: "ambiguous"), а НЕ только в отдельном списке ambiguousConditions

ТРЕБОВАНИЯ К ФОРМУЛИРОВКАМ (только для релевантных категорий):
• Улучшенные формулировки должны быть юридически корректными по российскому праву
• Рекомендации должны быть практичными и выполнимыми
• Правовые риски должны ссылаться на конкретные нормы ГК РФ где возможно
• Все предложения должны соответствовать российской правоприменительной практике`;

  try {
    console.log("🚀 Sending request to Gemini API...");
    console.log("Model:", MODEL_NAME);
    console.log("Prompt length:", userPrompt.length);
    
    // Оценка токенов на стороне клиента
    const estimatedTokens = Math.ceil(userPrompt.length / 3.5);
    console.log("=== ОЦЕНКА ТОКЕНОВ (КЛИЕНТ) ===");
    console.log("📝 Длина промпта (символы):", userPrompt.length.toLocaleString());
    console.log("🔢 Оценка токенов (клиент):", estimatedTokens.toLocaleString());
    console.log("📊 Настроенный лимит выхода:", "7,500 токенов (консервативный)");
    
    if (estimatedTokens > 900000) {
      console.warn("⚠️ ПРЕДУПРЕЖДЕНИЕ: Очень большой промпт, возможны проблемы");
    }
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 7500,  // Консервативный лимит для стабильности
        topP: 0.95,
        topK: 64,
      },
    });

    console.log("📥 Received response from Gemini API");
    console.log("Response object:", result);
    console.log("Response candidates:", result.response?.candidates?.length || 0);
    
    // Детальная информация о токенах
    if (result.response?.usageMetadata) {
      const usage = result.response.usageMetadata;
      console.log("=== ТОКЕНЫ GEMINI 2.0 FLASH-LITE ===");
      console.log("📊 Входные токены:", usage.promptTokenCount || "не указано");
      console.log("📊 Выходные токены:", usage.candidatesTokenCount || "не указано");
      console.log("📊 Всего токенов:", usage.totalTokenCount || "не указано");
      console.log("📊 Кэшированные токены:", usage.cachedContentTokenCount || "не указано");
      
      // Проверяем лимиты
      const inputLimit = 1000000;  // 1M токенов на вход
      const outputLimit = 7500;    // Консервативный лимит
      
      console.log("=== ЛИМИТЫ И ИСПОЛЬЗОВАНИЕ ===");
      console.log(`🔢 Лимит входных токенов: ${inputLimit.toLocaleString()}`);
      console.log(`🔢 Лимит выходных токенов: ${outputLimit.toLocaleString()} (консервативный)`);
      
      if (usage.promptTokenCount) {
        const inputUsage = (usage.promptTokenCount / inputLimit * 100).toFixed(1);
        console.log(`📈 Использование входных токенов: ${inputUsage}%`);
      }
      
      if (usage.candidatesTokenCount) {
        const outputUsage = (usage.candidatesTokenCount / outputLimit * 100).toFixed(1);
        console.log(`📈 Использование выходных токенов: ${outputUsage}%`);
        
        if (usage.candidatesTokenCount >= outputLimit * 0.95) {
          console.warn("⚠️ КРИТИЧНО: Использовано >95% лимита выходных токенов!");
        }
      }
    } else {
      console.warn("⚠️ Метаданные использования токенов недоступны");
    }
    
    if (result.response?.candidates && result.response.candidates.length > 0) {
      const candidate = result.response.candidates[0];
      console.log("=== ИНФОРМАЦИЯ О КАНДИДАТЕ ===");
      console.log("First candidate:", candidate);
      console.log("Candidate finish reason:", candidate.finishReason);
      console.log("Candidate safety ratings:", candidate.safetyRatings);
      
      // Детальный анализ причины завершения
      switch (candidate.finishReason) {
        case 'STOP':
          console.log("✅ Генерация завершена нормально");
          break;
        case 'MAX_TOKENS':
          console.error("❌ ПРЕВЫШЕН ЛИМИТ ВЫХОДНЫХ ТОКЕНОВ!");
          console.error("💡 Решение: Увеличить maxOutputTokens или сократить промпт");
          break;
        case 'SAFETY':
          console.error("❌ Контент заблокирован по безопасности");
          break;
        case 'RECITATION':
          console.error("❌ Контент заблокирован из-за повторения");
          break;
        case 'OTHER':
          console.error("❌ Неизвестная причина завершения");
          break;
        default:
          console.warn("⚠️ Неопознанная причина завершения:", candidate.finishReason);
      }
      
      if (candidate.finishReason === 'MAX_TOKENS') {
        console.warn("⚠️ Response was truncated due to MAX_TOKENS limit");
        
        // Fallback: попробуем с меньшим лимитом
        if (result.generationConfig?.maxOutputTokens && result.generationConfig.maxOutputTokens > 5000) {
          console.log("🔄 Attempting fallback with reduced token limit...");
          const fallbackLimit = Math.floor(result.generationConfig.maxOutputTokens * 0.8);
          
          try {
            const fallbackResult = await model.generateContent({
              contents: [{ role: "user", parts: [{ text: userPrompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.1,
                maxOutputTokens: fallbackLimit,
                topP: 0.95,
                topK: 64,
              },
            });
            
            if (fallbackResult.response?.candidates?.[0]?.finishReason === 'STOP') {
              console.log("✅ Fallback successful with limit:", fallbackLimit);
              // Используем fallback результат
              const fallbackResponse = fallbackResult.response;
              let fallbackText = fallbackResponse.text();
              // Продолжаем с fallback результатом...
              rawText = fallbackText;
            } else {
              throw new Error("Ответ от Gemini был обрезан из-за превышения лимита токенов. Попробуйте сократить текст договора или разбить анализ на части.");
            }
          } catch (fallbackError) {
            console.error("❌ Fallback also failed:", fallbackError);
            throw new Error("Ответ от Gemini был обрезан из-за превышения лимита токенов. Попробуйте сократить текст договора или разбить анализ на части.");
          }
        } else {
          throw new Error("Ответ от Gemini был обрезан из-за превышения лимита токенов. Попробуйте сократить текст договора или разбить анализ на части.");
        }
      }
    }

    const response = result.response;
    let rawText = response.text();
    
    console.log("=== GEMINI RESPONSE DEBUG ===");
    console.log("Raw response length:", rawText.length);
    
    if (rawText.length === 0) {
      console.error("❌ EMPTY RESPONSE FROM GEMINI!");
      console.error("Full result object:", JSON.stringify(result, null, 2));
      throw new Error("Gemini вернул пустой ответ. Возможно, контент был заблокирован или модель недоступна.");
    }
    
    // Более надежная очистка JSON для разных версий Gemini
    let cleanedResponse = rawText.trim();
    
    // Удаляем markdown блоки если есть
    if (cleanedResponse.includes('```json')) {
      const jsonMatch = cleanedResponse.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[1].trim();
      }
    } else if (cleanedResponse.includes('```')) {
      const codeMatch = cleanedResponse.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        cleanedResponse = codeMatch[1].trim();
      }
    }
    
    console.log("After markdown removal:", cleanedResponse.substring(0, 200));
    
    // Очищаем проблемные символы (табуляции, неразрывные пробелы, etc)
    cleanedResponse = cleanedResponse
      .replace(/\t/g, ' ')           // Заменяем табуляции на пробелы
      .replace(/\u00A0/g, ' ')       // Заменяем неразрывные пробелы
      .replace(/\u2028/g, ' ')       // Заменяем line separator
      .replace(/\u2029/g, ' ')       // Заменяем paragraph separator
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' '); // Удаляем control characters
    
    console.log("After character cleaning:", cleanedResponse.substring(0, 200));
    
    // Для Gemini 2.5 - если ответ уже начинается с { и заканчивается }, НЕ ТРОГАЕМ его
    if (cleanedResponse.startsWith('{') && cleanedResponse.endsWith('}')) {
      console.log("✅ Response is already valid JSON format, skipping aggressive cleaning");
      // НЕ ДЕЛАЕМ НИЧЕГО - оставляем как есть
    } else if (cleanedResponse.startsWith('[') && cleanedResponse.endsWith(']')) {
      console.log("✅ Response is already valid JSON array format, skipping aggressive cleaning");
      // НЕ ДЕЛАЕМ НИЧЕГО - оставляем как есть
    } else {
      // Только для случаев когда JSON НЕ в правильном формате
      console.log("⚠️ Response needs cleaning, applying regex fixes");
      const originalLength = cleanedResponse.length;
      cleanedResponse = cleanedResponse
        .replace(/^[^{]*({[\s\S]*})[^}]*$/, '$1')
        .replace(/^[^[]*(\[[\s\S]*\])[^\]]*$/, '$1');
      
      console.log("After prefix/suffix removal:", cleanedResponse.length !== originalLength ? "CHANGED" : "NO_CHANGE");
    }
    
    console.log("Cleaned response length:", cleanedResponse.length);
    console.log("Cleaned response (first 500 chars):", cleanedResponse.substring(0, 500));
    
    // Проверяем, что у нас есть валидный JSON
    if (!cleanedResponse.startsWith('{') && !cleanedResponse.startsWith('[')) {
      console.error("ERROR: Response doesn't start with { or [");
      console.error("Full cleaned response:", cleanedResponse);
      throw new Error(`Ответ не содержит валидный JSON. Получен: ${cleanedResponse.substring(0, 200)}...`);
    }
    
    console.log("Attempting to parse JSON...");
    
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
      console.log("✅ JSON parsed successfully on first attempt");
    } catch (parseError) {
      console.error("❌ JSON parse error:", parseError);
      console.error("Failed to parse (first 1000 chars):", cleanedResponse.substring(0, 1000));
      
      // Попытка исправить распространенные проблемы JSON
      console.log("Attempting to fix JSON...");
      let fixedJson = cleanedResponse
        .replace(/,\s*}/g, '}')  // Удаляем trailing commas
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Добавляем кавычки к ключам
        .replace(/:\s*([^",\[\]{}\s]+)(\s*[,}])/g, ': "$1"$2'); // Добавляем кавычки к значениям
      
      console.log("Fixed JSON (first 500 chars):", fixedJson.substring(0, 500));
      
      try {
        parsedResponse = JSON.parse(fixedJson);
        console.log("✅ JSON parsed successfully after fixing");
      } catch (secondParseError) {
        console.error("❌ Second JSON parse error:", secondParseError);
        console.error("Fixed JSON that still failed:", fixedJson.substring(0, 1000));
        
        // Последняя попытка - попробуем найти JSON в тексте
        console.log("Last attempt: searching for JSON in text...");
        const jsonMatches = rawText.match(/{[\s\S]*}/g);
        if (jsonMatches && jsonMatches.length > 0) {
          console.log("Found potential JSON matches:", jsonMatches.length);
          for (let i = 0; i < jsonMatches.length; i++) {
            try {
              parsedResponse = JSON.parse(jsonMatches[i]);
              console.log(`✅ Successfully parsed JSON match ${i + 1}`);
              break;
            } catch (e) {
              console.log(`❌ JSON match ${i + 1} failed to parse`);
            }
          }
        }
        
        if (!parsedResponse) {
          throw new Error(`Не удалось распарсить ответ от Gemini. Проверьте корректность данных и попробуйте снова.`);
        }
      }
    }
    
    // Валидация структуры ответа
    if (!parsedResponse || typeof parsedResponse !== 'object') {
      throw new Error('Ответ от Gemini не содержит валидный объект');
    }
    
    console.log("Parsed response data structure:", Object.keys(parsedResponse));
    console.log("Analysis array length:", parsedResponse.analysis?.length || 0);
    console.log("Missing requirements length:", parsedResponse.missingRequirements?.length || 0);

    // Обработка результатов анализа абзацев
    const contractParagraphs: ContractParagraph[] = paragraphs.map(paragraph => {
      const analysis = parsedResponse.analysis?.find((item: any) => item.id === paragraph.id);
      
      return {
        id: paragraph.id,
        text: paragraph.text,
        category: analysis?.category || null,
        comment: analysis?.comment || null,
        recommendation: analysis?.recommendation || null,
        improvedClause: analysis?.improvedClause || null,
        legalRisk: analysis?.legalRisk || null,
        isExpanded: false,
      };
    });

    // Обработка отсутствующих требований
    const missingRequirements: ContractParagraph[] = (parsedResponse.missingRequirements || []).map((req: any, index: number) => ({
          id: `missing_${index + 1}`,
      text: req.requirement || req.text || "Неопределенное требование",
      comment: req.comment || null,
      recommendation: req.recommendation || null,
      category: 'missing' as const,
    }));

    // Обработка неоднозначных условий из отдельного списка (для обратной совместимости)
    const ambiguousConditions: ContractParagraph[] = (parsedResponse.ambiguousConditions || []).map((cond: any, index: number) => ({
          id: `ambiguous_list_${index + 1}`,
      text: cond.condition || cond.text || "Неопределенное условие",
      comment: cond.comment || null,
      recommendation: cond.recommendation || null,
      category: 'ambiguous' as const,
    }));

    console.log("Final results:", {
      contractParagraphs: contractParagraphs.length,
      missingRequirements: missingRequirements.length,
      ambiguousConditions: ambiguousConditions.length,
      hasStructuralAnalysis: !!parsedResponse.structuralAnalysis
    });

    return {
      contractParagraphs,
      missingRequirements,
      ambiguousConditions,
      structuralAnalysis: parsedResponse.structuralAnalysis || {
        overallAssessment: "Анализ выполнен",
        keyRisks: [],
        structureComments: "",
        legalCompliance: "",
        recommendations: []
      }
    };
  } catch (error) {
    console.error("Gemini API error:", error);
    
    if (error.message?.includes('Candidate was blocked')) {
      throw new Error('Запрос был заблокирован системой безопасности. Попробуйте изменить формулировку.');
    }
    
    if (error.message?.includes('не удалось распарсить') || error.message?.includes('Failed to parse')) {
      throw new Error('Не удалось распарсить ответ от Gemini. Проверьте корректность данных и попробуйте снова.');
    }
    
    throw new Error(`Ошибка при анализе договора: ${error.message}`);
  }
}