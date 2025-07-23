import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { type ContractParagraph } from "@shared/schema";

const MODEL_NAME = 'gemini-2.5-flash';

// Конфигурация для разбивки на чанки
const CHUNKING_CONFIG = {
  // Максимальное количество токенов на чанк (оптимизировано для русского языка)
  MAX_TOKENS_PER_CHUNK: 600, // Уменьшено с 8000 до 600 токенов для предотвращения MAX_TOKENS
  
  // Количество предложений для перекрытия между чунками
  OVERLAP_SENTENCES: 2, // Увеличено с 1 до 2 предложений для лучшего контекста
  
  // Максимальная длина абзаца перед принудительным разделением
  MAX_PARAGRAPH_LENGTH: 1500,
  
  // Минимальная длина содержательного текста
  MIN_CONTENT_LENGTH: 20,
};

// Пул API ключей с механизмом round-robin
class ApiKeyPool {
  private keys: string[] = [];
  private currentIndex = 0;
  private keyUsageCount: Map<string, number> = new Map();
  private exhaustedKeys: Set<string> = new Set();

  constructor() {
    const apiKeyEnv = import.meta.env.VITE_API_KEY;
    if (!apiKeyEnv) {
      throw new Error("VITE_API_KEY не установлен");
    }
    
    // Поддержка нескольких ключей через запятую
    this.keys = apiKeyEnv.split(',').map((key: string) => key.trim()).filter((key: string) => key.length > 0);
    
    if (this.keys.length === 0) {
      throw new Error("Не найдено валидных API ключей");
    }
    
    // Инициализируем счетчики использования
    this.keys.forEach(key => {
      this.keyUsageCount.set(key, 0);
    });
    
    console.log(`🔑 Инициализирован пул из ${this.keys.length} API ключей`);
  }

  getNextKey(): string {
    // Проверяем, есть ли доступные ключи
    const availableKeys = this.keys.filter(key => !this.exhaustedKeys.has(key));
    
    if (availableKeys.length === 0) {
      throw new Error("Все API ключи исчерпали свои квоты");
    }
    
    // Находим индекс следующего доступного ключа
    let attempts = 0;
    while (attempts < this.keys.length) {
      const key = this.keys[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.keys.length;
      
      if (!this.exhaustedKeys.has(key)) {
        const currentCount = this.keyUsageCount.get(key) || 0;
        this.keyUsageCount.set(key, currentCount + 1);
        console.log(`🔑 Использую ключ ${key.substring(0, 10)}... (использован ${currentCount + 1} раз, доступно ${this.getAvailableKeyCount()}/${this.getKeyCount()})`);
        return key;
      }
      
      attempts++;
    }
    
    throw new Error("Не удалось найти доступный API ключ");
  }

  // Новый метод для подсчета токенов в тексте
  private estimateTokens(text: string): number {
    // Эмпирическая эвристика для русского языка: 1 токен ≈ 4 символа
    // Это более стабильно, чем подсчет слов
    const AVERAGE_CHARS_PER_TOKEN = 4;
    return Math.ceil(text.length / AVERAGE_CHARS_PER_TOKEN);
  }

  // Метод для логирования использования токенов
  logTokenUsage(operation: string, inputText: string, outputText: string = ''): void {
    const inputTokens = this.estimateTokens(inputText);
    const outputTokens = this.estimateTokens(outputText);
    const totalTokens = inputTokens + outputTokens;
    
    console.log(`📊 ТОКЕНЫ [${operation}]:`, {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens,
      inputLength: inputText.length,
      outputLength: outputText.length
    });
  }

  markKeyAsExhausted(key: string): void {
    this.exhaustedKeys.add(key);
    console.warn(`⚠️ Ключ ${key.substring(0, 10)}... помечен как исчерпанный`);
  }

  getKeyCount(): number {
    return this.keys.length;
  }

  getAvailableKeyCount(): number {
    return this.keys.length - this.exhaustedKeys.size;
  }

  getKeyUsageCount(key: string): number {
    return this.keyUsageCount.get(key) || 0;
  }
}

// Глобальный пул ключей
const keyPool = new ApiKeyPool();

// Функция для извлечения JSON из "грязного" ответа
function extractJsonFromResponse(rawResponse: string): any {
  console.log("🔍 Обработка сырого ответа:", rawResponse.substring(0, 200));
  
  // Проверка на пустой ответ
  if (!rawResponse || rawResponse.trim().length === 0) {
    console.warn("⚠️ Получен пустой ответ от Gemini API");
    return {
      chunkId: "unknown",
      analysis: []
    };
  }
  
  let cleanedResponse = rawResponse.trim();
  
  // Удаляем markdown блоки
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
  
  // Очищаем проблемные символы
  cleanedResponse = cleanedResponse
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\u2028/g, ' ')
    .replace(/\u2029/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
  
  // Попытка парсинга
  try {
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("❌ Ошибка парсинга JSON:", error);
    console.log("📝 Исходный ответ длиной:", rawResponse.length);
    
    // Попытка восстановить обрезанный JSON
    let repairedJson = cleanedResponse;
    
    // Улучшенная логика восстановления обрезанных строк
    if (repairedJson.includes('"')) {
      // Находим все незакрытые кавычки
      let quoteCount = 0;
      let lastQuoteIndex = -1;
      
      for (let i = 0; i < repairedJson.length; i++) {
        if (repairedJson[i] === '"' && (i === 0 || repairedJson[i-1] !== '\\')) {
          quoteCount++;
          lastQuoteIndex = i;
        }
      }
      
      // Если количество кавычек нечетное, значит есть незакрытая строка
      if (quoteCount % 2 !== 0) {
        // Обрезаем до последней кавычки и добавляем закрывающую
        repairedJson = repairedJson.substring(0, lastQuoteIndex + 1) + '"';
        console.log("🔧 Попытка закрыть обрезанную строку");
      }
    }
    
    // Добавляем недостающие закрывающие скобки
    let openBrackets = 0;
    let openBraces = 0;
    
    for (let i = 0; i < repairedJson.length; i++) {
      if (repairedJson[i] === '{') openBraces++;
      else if (repairedJson[i] === '}') openBraces--;
      else if (repairedJson[i] === '[') openBrackets++;
      else if (repairedJson[i] === ']') openBrackets--;
    }
    
    // Добавляем недостающие закрывающие символы
    while (openBrackets > 0) {
      repairedJson += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      repairedJson += '}';
      openBraces--;
    }
    
    // Убираем trailing commas перед закрывающими скобками
    repairedJson = repairedJson
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']');
    
    console.log("🔧 Попытка восстановления JSON:", repairedJson.substring(0, 300));
    
    try {
      return JSON.parse(repairedJson);
    } catch (secondError) {
      console.error("❌ Вторая попытка парсинга провалена:", secondError);
      
      // Специальная обработка для верификации противоречий
      if (rawResponse.includes('isContradiction')) {
        console.log("🔍 Пытаемся извлечь данные верификации противоречий");
        const fallbackResult = {
          isContradiction: false,
          severity: "low",
          explanation: "Не удалось полностью проанализировать противоречие",
          recommendation: "Требуется ручная проверка"
        };
        
        // Пытаемся извлечь isContradiction
        const contradictionMatch = rawResponse.match(/"isContradiction":\s*(true|false)/);
        if (contradictionMatch) {
          fallbackResult.isContradiction = contradictionMatch[1] === 'true';
        }
        
        // Пытаемся извлечь severity
        const severityMatch = rawResponse.match(/"severity":\s*"(high|medium|low)"/);
        if (severityMatch) {
          fallbackResult.severity = severityMatch[1] as "high" | "medium" | "low";
        }
        
        return fallbackResult;
      }
      
      // Специальная обработка для противоречий
      if (rawResponse.includes('contradictions')) {
        console.log("🔍 Пытаемся извлечь данные противоречий");
        
        // Пытаемся найти хотя бы одно противоречие
        const contradictionMatch = rawResponse.match(/"id":\s*"contr_\d+"/);
        if (contradictionMatch) {
          console.log("🔍 Найдено частичное противоречие, возвращаем пустой массив");
          return { contradictions: [] };
        }
      }
      
      // Улучшенная попытка восстановления обрезанного JSON для анализа чанков
      if (rawResponse.includes('"chunkId"') && rawResponse.includes('"analysis"')) {
        console.log("🔧 Пытаемся восстановить обрезанный JSON анализа чанка");
        
        // Извлекаем chunkId
        const chunkIdMatch = rawResponse.match(/"chunkId":\s*"([^"]+)"/);
        const chunkId = chunkIdMatch ? chunkIdMatch[1] : "unknown";
        
        // Пытаемся найти все завершенные объекты анализа
        const analysisObjects: any[] = [];
        
        // Ищем завершенные объекты анализа с помощью регулярного выражения
        const analysisPattern = /{[^}]*"id":\s*"[^"]+",\s*"category":\s*"[^"]*"[^}]*}/g;
        let match;
        while ((match = analysisPattern.exec(rawResponse)) !== null) {
          try {
            const analysisObj = JSON.parse(match[0]);
            analysisObjects.push(analysisObj);
            console.log(`🔧 Восстановлен объект анализа: ${analysisObj.id}`);
          } catch (e) {
            // Пропускаем невалидные объекты
          }
        }
        
        // Если нашли хотя бы один объект анализа, возвращаем результат
        if (analysisObjects.length > 0) {
          console.log(`✅ Восстановлено ${analysisObjects.length} объектов анализа для ${chunkId}`);
          return {
            chunkId: chunkId,
            analysis: analysisObjects
          };
        }
        
        // Если не удалось восстановить объекты, пытаемся найти хотя бы ID и категории
        const simpleAnalysisPattern = /"id":\s*"([^"]+)",\s*"category":\s*"([^"]*)"/g;
        const simpleObjects: any[] = [];
        
        while ((match = simpleAnalysisPattern.exec(rawResponse)) !== null) {
          simpleObjects.push({
            id: match[1],
            category: match[2] || null,
            comment: null,
            recommendation: null
          });
        }
        
        if (simpleObjects.length > 0) {
          console.log(`🔧 Восстановлено ${simpleObjects.length} упрощенных объектов анализа`);
          return {
            chunkId: chunkId,
            analysis: simpleObjects
          };
        }
      }
      
      // Попытка найти хотя бы частичный валидный JSON для обычного анализа
      const jsonMatches = rawResponse.match(/{[^}]*"chunkId"[^}]*}/g);
      if (jsonMatches && jsonMatches.length > 0) {
        console.log("🔍 Найден частичный JSON с chunkId");
        for (const jsonMatch of jsonMatches) {
          try {
            const partial = JSON.parse(jsonMatch + ', "analysis": []}');
            return partial;
          } catch (e) {
            continue;
          }
        }
      }
      
      // Последний fallback - возвращаем пустой результат
      console.warn("⚠️ Возвращаем пустой результат для данного чунка");
      return {
        chunkId: "failed",
        analysis: []
      };
    }
  }
}

// Создание чанков на основе токенов с перекрытием для сохранения контекста
function createChunksWithTokens(
  paragraphs: Array<{ id: string; text: string }>, 
  maxTokensPerChunk: number = CHUNKING_CONFIG.MAX_TOKENS_PER_CHUNK,
  overlapSentences: number = CHUNKING_CONFIG.OVERLAP_SENTENCES
): Array<{ id: string; paragraphs: Array<{ id: string; text: string }>, tokenCount: number, hasOverlap: boolean }> {
  
  const chunks: Array<{ id: string; paragraphs: Array<{ id: string; text: string }>, tokenCount: number, hasOverlap: boolean }> = [];
  let currentChunk: Array<{ id: string; text: string }> = [];
  let currentTokenCount = 0;
  let previousChunkSentences: string[] = []; // Для хранения последних предложений
  
  // Функция для подсчета токенов в тексте
  const countTokens = (text: string): number => {
    // Эмпирическая эвристика для русского языка: 1 токен ≈ 4 символа
    const AVERAGE_CHARS_PER_TOKEN = 4;
    return Math.ceil(text.length / AVERAGE_CHARS_PER_TOKEN);
  };
  
  // Функция для извлечения последних предложений из текста
  const getLastSentences = (text: string, count: number): string[] => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.slice(-count).map(s => s.trim() + '.');
  };
  
  // Функция для создания перекрывающего текста
  const createOverlapText = (sentences: string[]): string => {
    if (sentences.length === 0) return '';
    return `[КОНТЕКСТ ИЗ ПРЕДЫДУЩЕГО ЧАНКА]: ${sentences.join(' ')}`;
  };
  
  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];
    const paragraphTokens = countTokens(paragraph.text);
    
    // Проверяем, поместится ли абзац в текущий чанк
    const overlapTokens = previousChunkSentences.length > 0 ? 
      countTokens(createOverlapText(previousChunkSentences)) : 0;
    
    // --- ДОБАВЛЕНО: ограничение по количеству абзацев ---
    const maxParagraphsPerChunk = 6;
    if ((currentTokenCount + paragraphTokens + overlapTokens > maxTokensPerChunk || currentChunk.length >= maxParagraphsPerChunk) && currentChunk.length > 0) {
      // Сохраняем последние предложения для следующего чанка
      const lastParagraphText = currentChunk[currentChunk.length - 1]?.text || '';
      previousChunkSentences = getLastSentences(lastParagraphText, overlapSentences);
      
      // Создаем чанк
      chunks.push({
        id: `chunk_${chunks.length + 1}`,
        paragraphs: [...currentChunk],
        tokenCount: currentTokenCount,
        hasOverlap: false
      });
      
      // Начинаем новый чанк с перекрытием
      currentChunk = [];
      currentTokenCount = 0;
      
      // Добавляем перекрывающий контекст в начало нового чанка
      if (previousChunkSentences.length > 0) {
        const overlapText = createOverlapText(previousChunkSentences);
        currentChunk.push({
          id: `overlap_${chunks.length + 1}`,
          text: overlapText
        });
        currentTokenCount += countTokens(overlapText);
      }
    }
    
    // Добавляем текущий абзац
    currentChunk.push(paragraph);
    currentTokenCount += paragraphTokens;
  }
  
  // Добавляем последний чанк, если он не пустой
  if (currentChunk.length > 0) {
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      paragraphs: currentChunk,
      tokenCount: currentTokenCount,
      hasOverlap: previousChunkSentences.length > 0
    });
  }
  
  console.log(`📦 Создано ${chunks.length} чанков на основе токенов:`);
  chunks.forEach((chunk, index) => {
    console.log(`   Чанк ${index + 1}: ${chunk.tokenCount} токенов, ${chunk.paragraphs.length} абзацев${chunk.hasOverlap ? ' (с перекрытием)' : ''}`);
  });
  
  return chunks;
}

// Простая разбивка на чанки по количеству абзацев
function createChunks(paragraphs: Array<{ id: string; text: string }>, chunkSize: number = 10): Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }> {
  const chunks: Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }> = [];
  
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunkParagraphs = paragraphs.slice(i, i + chunkSize);
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      paragraphs: chunkParagraphs
    });
  }
  
  console.log(`📦 Создано ${chunks.length} чанков по ${chunkSize} абзацев:`);
  chunks.forEach((chunk, index) => {
    console.log(`   Чанк ${index + 1}: ${chunk.paragraphs.length} абзацев`);
  });
  
  return chunks;
}

// Анализ одного чанка с обработкой ошибок 429
async function analyzeChunk(
  chunk: { id: string; paragraphs: Array<{ id: string; text: string }> },
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier'
): Promise<any> {
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyToUse = keyPool.getNextKey();
    
    try {
      const genAI = new GoogleGenerativeAI(keyToUse);
      const model = genAI.getGenerativeModel({ 
        model: MODEL_NAME,
        systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
      });

      const perspectiveContext = perspective === 'buyer'
        ? { role: 'Покупателя', beneficiary: 'покупателя' }
        : { role: 'Поставщика', beneficiary: 'поставщика' };

      const chunkPrompt = `Ты - эксперт по анализу договоров для ${perspectiveContext.role}. 

ОБЯЗАТЕЛЬНЫЕ ТРЕБОВАНИЯ (ЧЕК-ЛИСТ):
${checklistText}

Твоя задача - проанализировать абзацы и АКТИВНО сопоставить их с требованиями из чек-листа выше.

Категории:
"checklist" - абзац ПОЛНОСТЬЮ соответствует одному из требований чек-листа. В комментарии ОБЯЗАТЕЛЬНО укажи: "✅ Соответствует требованию: [точная цитата из чек-листа]"
"partial" - абзац ЧАСТИЧНО соответствует требованию. В комментарии укажи: "🔶 Частично соответствует требованию: [цитата из чек-листа]. Выполнено: [что есть]. Отсутствует: [чего нет]"
"risk" - содержит риски для ${perspectiveContext.beneficiary} (с комментариями)  
"ambiguous" - неоднозначные условия, требующие пояснений
"deemed_acceptance" - риски молчания/бездействия
"external_refs" - ссылки на внешние документы (ГОСТы, ТУ, регламенты, правила)
null - только нейтральные пункты БЕЗ комментариев (адреса, реквизиты, стандартные формулировки)

СТРОГО ОБЯЗАТЕЛЬНО: 
1. Если обнаружишь противоречия в абзаце с другими частями договора (разные сроки, суммы, условия), обязательно укажи это в комментарии! Например: "ПРОТИВОРЕЧИЕ: Здесь указан срок 10 дней, но в п.5.2 указано 5 дней для того же процесса"
2. Если пункт заслуживает комментария, ОБЯЗАТЕЛЬНО присвой ему подходящую категорию:
   - "ambiguous" для любых неточных формулировок, требующих пояснений
   - "partial" для частично выполненных требований  
   - "risk" для рисков
   - "deemed_acceptance" для рисков молчания
   - "external_refs" для ссылок на документы
3. Используй category: null ТОЛЬКО для нейтральных пунктов БЕЗ комментариев (адреса, реквизиты, даты)

ОСОБОЕ ВНИМАНИЕ:
1. "deemed_acceptance": Если в пункте есть срок для действия, но НЕ описаны последствия бездействия, это риск! Спроси себя: "Что если сторона НЕ выполнит это действие в срок?"
2. "external_refs": Любая ссылка на ГОСТ, ТУ, СанПиН, правила, регламенты - это скрытый риск незнания содержания документа
3. Анализируй не только ответственность, но и права: сколько оснований для расторжения/приостановки у каждой стороны?

Абзацы: ${JSON.stringify(chunk.paragraphs)}

JSON:
{
  "chunkId": "${chunk.id}",
  "analysis": [
    {
      "id": "p1", 
      "category": "checklist",
      "comment": "✅ Соответствует требованию: Сроки поставки установлены конкретные сроки поставки",
      "recommendation": null
    },
    {
      "id": "p2", 
      "category": "partial",
      "comment": "🔶 Частично соответствует требованию: Порядок фиксации недостатков. Выполнено: указан срок уведомления. Отсутствует: срок прибытия представителя",
      "recommendation": "Добавить срок для прибытия представителя поставщика"
    },
    {
      "id": "p3", 
      "category": "deemed_acceptance",
      "comment": "Не описаны последствия если Покупатель не подпишет документ в срок - молчание может быть приравнено к согласию",
      "recommendation": "Добавить пункт: 'При непредставлении возражений в указанный срок товар считается принятым'"
    },
    {
      "id": "p3", 
      "category": "external_refs",
      "comment": "Ссылка на ГОСТ 8267-93 - его содержание становится частью договора",
      "recommendation": "Ознакомьтесь с полным текстом ГОСТ 8267-93 или приложите его к договору"
    },
    {
      "id": "p4", 
      "category": "ambiguous",
      "comment": "Формулировка 'в разумные сроки' неоднозначна и может трактоваться по-разному",
      "recommendation": "Указать конкретный срок, например '10 рабочих дней'"
    },
    {
      "id": "p5", 
      "category": null,
      "comment": null,
      "recommendation": null
    }
  ],
  "chunkRightsAnalysis": {
    "buyerRightsCount": 2,
    "supplierRightsCount": 1,
    "rightsDetails": [
      "Покупатель: право расторгнуть при просрочке (п. p1)",
      "Покупатель: право отказаться от товара (п. p2)", 
      "Поставщик: право изменить цену (п. p4)"
    ],
    "classifiedClauses": [
      { "id": "p1", "party": "buyer", "type": "termination" },
      { "id": "p2", "party": "buyer", "type": "control" },
      { "id": "p4", "party": "supplier", "type": "modification" }
    ]
  }
}

ДОПОЛНИТЕЛЬНО: После основного анализа, подсчитай права в секции chunkRightsAnalysis:
- buyerRightsCount: количество прав/оснований для покупателя в этом чанке
- supplierRightsCount: количество прав/оснований для поставщика в этом чанке  
- rightsDetails: краткий список найденных прав (формат: "Сторона: краткое описание (п. id)")
- classifiedClauses: массив объектов с классификацией каждого права по стороне и типу:
  * party: "buyer", "supplier", "both", "neutral"
  * type: "termination" (расторжение), "modification" (изменение условий), "liability" (штрафы/неустойки), "control" (проверка/приемка), "procedural" (процедурные права)

ЗАПОМНИ: 
- Пункт p4 показывает, что неоднозначные формулировки должны быть "ambiguous" с комментариями
- Пункт p5 показывает правильный формат для category: null - только нейтральные пункты БЕЗ комментариев!
- chunkRightsAnalysis должен содержать ТОЛЬКО права из текущего чанка!
- classifiedClauses должен включать ВСЕ пункты с правами, даже если они "both" или "neutral"`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: chunkPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 8000, // Возвращаем обратно - проблема не в лимите
          topP: 0.95,
          topK: 64,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      });

      // Проверяем причину завершения
      const finishReason = result.response?.candidates?.[0]?.finishReason;
      const usageMetadata = result.response?.usageMetadata;
      
      console.log(`📊 ${chunk.id}: finishReason=${finishReason}, usageMetadata:`, usageMetadata);
      
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`⚠️ ${chunk.id}: Нестандартное завершение - ${finishReason}`);
        
        if (finishReason === 'MAX_TOKENS') {
          console.warn(`⚠️ ${chunk.id}: Ответ обрезан из-за лимита токенов - попытаемся восстановить`);
          // Продолжаем обработку, система восстановления JSON попытается извлечь данные
        } else if (finishReason === 'OTHER') {
          console.warn(`⚠️ ${chunk.id}: Завершение по неизвестной причине - возможно внутренние ограничения Gemini`);
        } else if (finishReason === 'SAFETY') {
          console.warn(`⚠️ ${chunk.id}: Завершение из-за фильтров безопасности`);
        }
      }

      const rawResponse = result.response.text();
      console.log(`📝 Сырой ответ для ${chunk.id}:`, rawResponse.substring(0, 300));
      
      // Логируем использование токенов
      keyPool.logTokenUsage(`CHUNK_${chunk.id}`, chunkPrompt, rawResponse);
      
      return extractJsonFromResponse(rawResponse);
      
    } catch (error: any) {
      lastError = error;
      
      // Проверяем, является ли это ошибкой 429 (квота исчерпана)
      if (error.message && error.message.includes('429') && error.message.includes('Resource has been exhausted')) {
        console.warn(`⚠️ ${chunk.id}: Ключ ${keyToUse.substring(0, 10)}... исчерпал квоту, пробуем следующий`);
        keyPool.markKeyAsExhausted(keyToUse);
        
        // Если есть доступные ключи, пробуем еще раз
        if (keyPool.getAvailableKeyCount() > 0) {
          console.log(`🔄 ${chunk.id}: Повторная попытка с другим ключом (попытка ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Пауза перед повторной попыткой
          continue;
        } else {
          console.error(`❌ ${chunk.id}: Все ключи исчерпали квоты`);
          throw error;
        }
      }
      
      // Для других ошибок делаем простую повторную попытку
      console.warn(`⚠️ ${chunk.id}: Ошибка (попытка ${attempt + 1}/${maxRetries}):`, error.message);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Увеличиваем задержку
      }
    }
  }
  
  throw lastError || new Error(`Не удалось обработать чанк ${chunk.id} после ${maxRetries} попыток`);
}

// Параллельная обработка чанков с контролируемым параллелизмом
async function processChunksInParallel(
  chunks: Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }>,
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any[]> {
  const results: any[] = [];
  
  // Настройки параллелизма
  const batchSize = Math.min(8, keyPool.getAvailableKeyCount()); // Максимум 3 одновременных запроса
  const batchDelay = 4000; // 4 секунды между батчами
  
  console.log(`📋 Начинаем параллельную обработку ${chunks.length} чанков (батчи по ${batchSize}, пауза ${batchDelay}ms)`);
  
  let processedChunks = 0;
  const totalChunks = chunks.length;
  
  // Разбиваем чанки на батчи
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(chunks.length / batchSize);
    
    // Показываем понятное сообщение пользователю
    const percentComplete = Math.round((processedChunks / totalChunks) * 100);
    onProgress(`Этап 2/7: Анализ содержимого договора... ${percentComplete}% завершено`);
    
    console.log(`🚀 Запускаем батч ${batchNumber}: чанки ${i + 1}-${Math.min(i + batchSize, chunks.length)}`);
    
    try {
      // Запускаем обработку всех чанков в батче параллельно
      const batchPromises = batch.map(async (chunk, index) => {
        const chunkNumber = i + index + 1;
        console.log(`🔍 Обрабатываем чанк ${chunkNumber} параллельно: ${chunk.paragraphs.length} абзацев`);
        
        try {
          const result = await analyzeChunk(chunk, checklistText, riskText, perspective);
          console.log(`✅ Чанк ${chunkNumber} обработан успешно`);
          return { index: chunkNumber - 1, result };
        } catch (error) {
          console.error(`❌ Ошибка в чанке ${chunkNumber}:`, error);
          throw new Error(`Чанк ${chunkNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
        }
      });
      
      // Ждем завершения всех задач в батче
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Обрабатываем результаты
      batchResults.forEach((result, batchIndex) => {
        if (result.status === 'fulfilled') {
          results[result.value.index] = result.value.result;
          processedChunks++;
        } else {
          const chunkNumber = i + batchIndex + 1;
          console.error(`❌ Батч ${batchNumber}, чанк ${chunkNumber} завершился с ошибкой:`, result.reason);
          throw new Error(`Не удалось обработать чанк ${chunkNumber}: ${result.reason}`);
        }
      });
      
      console.log(`✅ Батч ${batchNumber} завершен успешно (${batch.length} чанков)`);
      
      // Обновляем прогресс после завершения батча
      const updatedPercent = Math.round((processedChunks / totalChunks) * 100);
      onProgress(`Этап 2/7: Анализ содержимого договора... ${updatedPercent}% завершено`);
      
      // Пауза между батчами (кроме последнего)
      if (i + batchSize < chunks.length) {
        const availableKeys = keyPool.getAvailableKeyCount();
        const actualDelay = availableKeys > 6 ? batchDelay * 0.7 : batchDelay; // Сокращаем задержку если много ключей
        
        console.log(`⏱️ Пауза ${actualDelay}ms между батчами (доступно ключей: ${availableKeys})`);
        onProgress(`Этап 2/7: Обработка следующей части договора...`);
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
      
    } catch (error) {
      console.error(`❌ Критическая ошибка в батче ${batchNumber}:`, error);
      throw error;
    }
  }
  
  // Проверяем что все результаты получены
  const processedCount = results.filter(r => r !== undefined).length;
  console.log(`📊 Параллельная обработка завершена: ${processedCount}/${chunks.length} чанков`);
  
  if (processedCount !== chunks.length) {
    throw new Error(`Не все чанки были обработаны: ${processedCount}/${chunks.length}`);
  }
  
  return results;
}

// Итоговый структурный анализ с полным контекстом всех найденных проблем
async function performFinalStructuralAnalysis(
  allAnalysis: any[],
  missingRequirements: any[],
  contradictions: any[],
  rightsImbalance: any[],
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  // onProgress уже вызван в основной функции
  
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  // Собираем самые критичные проблемы из каждой категории
  const criticalRisks = allAnalysis
    .filter((a: any) => a.category === 'risk' && a.comment)
    .map((a: any) => a.comment)
    .slice(0, 5); // Топ-5 рисков

  const deemedAcceptanceIssues = allAnalysis
    .filter((a: any) => a.category === 'deemed_acceptance' && a.comment)
    .map((a: any) => a.comment)
    .slice(0, 3); // Топ-3 проблемы молчания

  const externalRefsIssues = allAnalysis
    .filter((a: any) => a.category === 'external_refs' && a.comment)
    .map((a: any) => a.comment)
    .slice(0, 3); // Топ-3 внешние ссылки

  const partialIssues = allAnalysis
    .filter((a: any) => a.category === 'partial' && a.comment)
    .map((a: any) => a.comment)
    .slice(0, 3); // Топ-3 частичные проблемы

  const topMissingRequirements = missingRequirements
    .slice(0, 5)
    .map((req: any) => req.requirement || req.comment);

  const topContradictions = contradictions
    .slice(0, 3)
    .map((contr: any) => contr.description);

  const topRightsImbalance = rightsImbalance
    .slice(0, 3)
    .map((imb: any) => imb.description);

  const structuralPrompt = `На основе ПОЛНОГО анализа договора сформируй итоговую сводку для ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.

КРИТИЧНЫЕ РИСКИ ИЗ АНАЛИЗА:
${criticalRisks.length > 0 ? criticalRisks.join('\n- ') : 'Критичных рисков не обнаружено'}

ПРОБЛЕМЫ МОЛЧАНИЯ/БЕЗДЕЙСТВИЯ:
${deemedAcceptanceIssues.length > 0 ? deemedAcceptanceIssues.join('\n- ') : 'Проблем молчания не обнаружено'}

ВНЕШНИЕ ССЫЛКИ (СКРЫТЫЕ РИСКИ):
${externalRefsIssues.length > 0 ? externalRefsIssues.join('\n- ') : 'Внешних ссылок не обнаружено'}

ЧАСТИЧНЫЕ ПРОБЛЕМЫ:
${partialIssues.length > 0 ? partialIssues.join('\n- ') : 'Частичных проблем не обнаружено'}

ОТСУТСТВУЮЩИЕ ТРЕБОВАНИЯ:
${topMissingRequirements.length > 0 ? topMissingRequirements.join('\n- ') : 'Все требования выполнены'}

ПРОТИВОРЕЧИЯ В ДОГОВОРЕ:
${topContradictions.length > 0 ? topContradictions.join('\n- ') : 'Противоречий не обнаружено'}

ДИСБАЛАНС ПРАВ:
${topRightsImbalance.length > 0 ? topRightsImbalance.join('\n- ') : 'Дисбаланса прав не обнаружено'}

СТАТИСТИКА:
- Всего проанализировано пунктов: ${allAnalysis.length}
- Найдено рисков: ${criticalRisks.length}
- Отсутствующих требований: ${missingRequirements.length}
- Противоречий: ${contradictions.length}
- Дисбалансов прав: ${rightsImbalance.length}

Верни JSON с итоговой сводкой, указав ТОЛЬКО САМЫЕ ВАЖНЫЕ риски и рекомендации:
{
  "structuralAnalysis": {
    "overallAssessment": "Общая оценка договора с учетом всех найденных проблем (2-3 предложения)",
    "keyRisks": ["Только 3-5 САМЫХ КРИТИЧНЫХ рисков из всего анализа"],
    "structureComments": "Комментарий по структуре с учетом найденных проблем",
    "legalCompliance": "Оценка соответствия российскому законодательству",
    "recommendations": ["Только 3-5 САМЫХ ВАЖНЫХ рекомендаций для устранения критичных проблем"]
  }
}

ВАЖНО: Фокусируйся только на самых серьезных проблемах, которые могут привести к реальным убыткам или правовым рискам.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: structuralPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8000,
      topP: 0.95,
      topK: 64,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  const rawResponse = result.response.text();
  console.log("📊 Сырой ответ итогового структурного анализа:", rawResponse.substring(0, 300));
  
  // Логируем использование токенов
  keyPool.logTokenUsage('FINAL_STRUCTURAL_ANALYSIS', structuralPrompt, rawResponse);
  
  return extractJsonFromResponse(rawResponse);
}

// Старая функция структурного анализа (оставляем для совместимости)
async function performStructuralAnalysis(
  contractText: string,
  chunkResults: any[],
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  // onProgress уже вызван в основной функции
  
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  // Создаем краткую сводку вместо передачи всех данных
  const summaryResults = chunkResults.map(chunk => {
    const analysis = chunk.analysis || [];
    return {
      chunkId: chunk.chunkId,
      totalAnalyzed: analysis.length,
      risks: analysis.filter((a: any) => a.category === 'risk').length,
      partialIssues: analysis.filter((a: any) => a.category === 'partial').length,
      ambiguous: analysis.filter((a: any) => a.category === 'ambiguous').length,
      deemedAcceptance: analysis.filter((a: any) => a.category === 'deemed_acceptance').length,
      externalRefs: analysis.filter((a: any) => a.category === 'external_refs').length,
      checklist: analysis.filter((a: any) => a.category === 'checklist').length
    };
  });

  const structuralPrompt = `Сделай краткую сводку анализа договора для ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.

СТАТИСТИКА АНАЛИЗА ПО ЧАНКАМ:
${JSON.stringify(summaryResults, null, 2)}

Верни JSON с краткой сводкой:
{
  "structuralAnalysis": {
    "overallAssessment": "Краткая общая оценка договора (1-2 предложения)",
    "keyRisks": ["Основной риск 1", "Основной риск 2"],
    "structureComments": "Краткий комментарий по структуре",
    "legalCompliance": "Соответствует базовым требованиям российского законодательства",
    "recommendations": ["Ключевая рекомендация 1", "Ключевая рекомендация 2"]
  }
}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: structuralPrompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8000,
      topP: 0.95,
      topK: 64,
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });

  const rawResponse = result.response.text();
  console.log("📊 Сырой ответ структурного анализа:", rawResponse.substring(0, 300));
  
  // Логируем использование токенов
  keyPool.logTokenUsage('STRUCTURAL_ANALYSIS', structuralPrompt, rawResponse);
  
  return extractJsonFromResponse(rawResponse);
}

// Надежный программный поиск отсутствующих требований (без AI)
function findMissingRequirementsReliable(
  allAnalysis: any[],
  checklistText: string
): { missingRequirements: any[] } {
  console.log(`🔍 Начинаем надежный поиск отсутствующих требований`);
  
  // Шаг 1: Получаем список всех требований из чек-листа
  const allRequirements = checklistText
    .split(/[•\n]/)
    .map(req => req.trim().replace(/^[•\-\*\d\.]+\s*/, '')) // Убираем маркеры списка
    .filter(req => req.length > 20) // Фильтруем слишком короткие строки
    .map((req, index) => ({
      id: `req_${index + 1}`,
      text: req,
      // Извлекаем ключевые фразы для поиска (первые 30-50 символов)
      searchPhrase: req.substring(0, 50).toLowerCase()
    }));

  console.log(`📋 Всего требований в чек-листе: ${allRequirements.length}`);

  // Шаг 2: Собираем все комментарии AI, которые указывают на найденные требования
  const foundRequirementComments = allAnalysis
    .filter(item => 
      (item.category === 'checklist' || item.category === 'partial') && 
      item.comment &&
      (item.comment.includes('✅ Соответствует требованию:') || 
       item.comment.includes('🔶 Частично соответствует требованию:'))
    )
    .map(item => item.comment.toLowerCase());

  console.log(`📊 Найдено комментариев с указанием требований: ${foundRequirementComments.length}`);

  // Шаг 3: Программно определяем отсутствующие требования
  const missingRequirements: any[] = [];
  
  allRequirements.forEach(requirement => {
    // Ищем упоминание этого требования в комментариях AI
    const isFound = foundRequirementComments.some(comment => {
      // Проверяем несколько вариантов поиска для надежности
      const searchTerms = [
        requirement.searchPhrase,
        // Извлекаем ключевые слова из требования
        ...requirement.text.toLowerCase().split(' ')
          .filter(word => word.length > 4)
          .slice(0, 3) // Берем первые 3 значимых слова
      ];
      
      return searchTerms.some(term => 
        term.length > 4 && comment.includes(term)
      );
    });
    
    if (!isFound) {
      missingRequirements.push({
        requirement: requirement.text,
        comment: "Данное обязательное требование не было найдено в тексте договора."
      });
      console.log(`❌ Отсутствует требование: ${requirement.text.substring(0, 60)}...`);
    } else {
      console.log(`✅ Найдено требование: ${requirement.text.substring(0, 60)}...`);
    }
  });

  console.log(`📊 Итого отсутствующих требований: ${missingRequirements.length}`);
  
  return { missingRequirements };
}

// Улучшенный поиск отсутствующих требований на основе уже проанализированных данных (DEPRECATED)
async function findMissingRequirementsImproved(
  allAnalysis: any[],
  checklistText: string,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  console.log(`🔍 Начинаем улучшенный поиск отсутствующих требований`);
  
  // Шаг 1: Извлекаем ключевые слова из найденных требований
  const foundRequirements = allAnalysis
    .filter(item => item.category === 'checklist' || item.category === 'partial')
    .map(item => ({
      category: item.category,
      comment: item.comment || '',
      recommendation: item.recommendation || ''
    }));

  console.log(`📊 Найдено выполненных/частично выполненных требований: ${foundRequirements.length}`);

  // Шаг 2: Разбиваем чек-лист на отдельные требования
  const allRequirements = checklistText
    .split(/[•\n]/)
    .map(req => req.trim())
    .filter(req => req.length > 20) // Фильтруем слишком короткие строки
    .map((req, index) => ({
      id: `req_${index + 1}`,
      text: req.replace(/^[•\-\*\d\.]+\s*/, ''), // Убираем маркеры списка
      keywords: extractKeywords(req)
    }));

  console.log(`📋 Всего требований в чек-листе: ${allRequirements.length}`);

  // Шаг 3: Локальное сопоставление на основе ключевых слов
  const locallyFoundRequirements = new Set<string>();
  
  allRequirements.forEach(requirement => {
    const isFound = foundRequirements.some(found => {
      const foundText = (found.comment + ' ' + found.recommendation).toLowerCase();
      const matchingKeywords = requirement.keywords.filter(keyword => 
        foundText.includes(keyword.toLowerCase())
      );
      
      // Считаем требование найденным, если совпадает 40% ключевых слов или 2+ ключевых слова
      const matchRatio = matchingKeywords.length / requirement.keywords.length;
      return matchRatio >= 0.4 || matchingKeywords.length >= 2;
    });
    
    if (isFound) {
      locallyFoundRequirements.add(requirement.id);
      console.log(`✅ Локально найдено требование: ${requirement.text.substring(0, 50)}...`);
    }
  });

  // Шаг 4: Определяем потенциально отсутствующие требования
  const potentiallyMissing = allRequirements.filter(req => 
    !locallyFoundRequirements.has(req.id)
  );

  console.log(`🔍 Потенциально отсутствующих требований: ${potentiallyMissing.length}`);

  // Шаг 5: Если отсутствующих требований много, используем AI для финальной проверки
  if (potentiallyMissing.length === 0) {
    return { missingRequirements: [] };
  }

  // Ограничиваем количество для AI-проверки (топ-10 самых важных)
  const topMissing = potentiallyMissing
    .slice(0, 10)
    .map(req => req.text);

  // Шаг 6: Финальная AI-проверка только для потенциально отсутствующих
  return await verifyMissingRequirementsWithAI(
    topMissing,
    foundRequirements,
    perspective,
    onProgress
  );
}

// Функция извлечения ключевых слов из требования
function extractKeywords(text: string): string[] {
  // Убираем стоп-слова и извлекаем значимые термины
  const stopWords = new Set([
    'и', 'в', 'на', 'с', 'по', 'для', 'от', 'до', 'при', 'что', 'как', 'или', 'но', 'а', 'то',
    'это', 'все', 'еще', 'уже', 'только', 'может', 'должен', 'должна', 'должно', 'быть',
    'иметь', 'есть', 'был', 'была', 'было', 'будет', 'если', 'когда', 'где', 'который',
    'которая', 'которое', 'которые', 'также', 'таким', 'такой', 'такое', 'такие'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\wа-яё\s]/g, ' ') // Убираем пунктуацию
    .split(/\s+/)
    .filter(word => 
      word.length > 3 && 
      !stopWords.has(word) &&
      !/^\d+$/.test(word) // Убираем числа
    );

  // Извлекаем также биграммы (двухсловные фразы) для лучшего сопоставления
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (bigram.length > 6) {
      bigrams.push(bigram);
    }
  }

  return [...words, ...bigrams];
}

// AI-проверка только для потенциально отсутствующих требований
async function verifyMissingRequirementsWithAI(
  potentiallyMissing: string[],
  foundRequirements: any[],
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  console.log(`🤖 AI-проверка ${potentiallyMissing.length} потенциально отсутствующих требований`);
  
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  // Создаем краткую сводку найденных требований
  const foundSummary = foundRequirements
    .slice(0, 15) // Ограничиваем для экономии токенов
    .map(req => `${req.category}: ${req.comment?.substring(0, 80) || 'выполнено'}`)
    .join('\n');

  const verificationPrompt = `Проверь, действительно ли эти требования отсутствуют в договоре.

НАЙДЕННЫЕ В ДОГОВОРЕ ТРЕБОВАНИЯ:
${foundSummary}

ПОТЕНЦИАЛЬНО ОТСУТСТВУЮЩИЕ ТРЕБОВАНИЯ:
${potentiallyMissing.map((req, i) => `${i + 1}. ${req}`).join('\n')}

Верни JSON только с ДЕЙСТВИТЕЛЬНО отсутствующими требованиями (максимум 8):
{
  "missingRequirements": [
    {
      "requirement": "Краткое название требования",
      "comment": "Почему это важно для ${perspective === 'buyer' ? 'покупателя' : 'поставщика'}"
    }
  ]
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: verificationPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4000, // Уменьшаем лимит для экономии
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const rawResponse = result.response.text();
    console.log("🔍 AI-проверка отсутствующих требований:", rawResponse.substring(0, 200));
    
    if (!rawResponse || rawResponse.trim() === '') {
      console.log("⚠️ Пустой ответ AI-проверки");
      return { missingRequirements: [] };
    }
    
    return extractJsonFromResponse(rawResponse);
  } catch (error) {
    console.error("❌ Ошибка AI-проверки отсутствующих требований:", error);
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
    }
    return { missingRequirements: [] };
  }
}

// Старая функция поиска отсутствующих требований (оставляем для совместимости)
async function findMissingRequirements(
  contractText: string,
  checklistText: string,
  foundConditions: string[],
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  // onProgress уже вызван в основной функции
  
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  const missingPrompt = `Найди до 10 самых важных отсутствующих требований, сравнив чек-лист с выполненными условиями.

ПОЛНЫЙ ЧЕК-ЛИСТ:
${checklistText}

УЖЕ ПОЛНОСТЬЮ ВЫПОЛНЕННЫЕ УСЛОВИЯ (всего ${foundConditions.length}):
${foundConditions.join(', ')}

Верни JSON с до 10 самыми важными отсутствующими требованиями:
{
  "missingRequirements": [
    {
      "requirement": "Краткое название",
      "comment": "Короткое объяснение важности"
    }
  ]
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: missingPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8000,
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const rawResponse = result.response.text();
    console.log("🔍 Сырой ответ поиска отсутствующих требований:", rawResponse.substring(0, 300));
    
    if (!rawResponse || rawResponse.trim() === '') {
      console.log("⚠️ Пустой ответ, возвращаем пустой список отсутствующих требований");
      return { missingRequirements: [] };
    }
    
    return extractJsonFromResponse(rawResponse);
  } catch (error) {
    console.error("❌ Ошибка при поиске отсутствующих требований:", error);
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
      console.log("🔑 Ключ исчерпан, пробуем другой...");
      return await findMissingRequirements(contractText, checklistText, foundConditions, perspective, onProgress);
    }
    return { missingRequirements: [] };
  }
}

// Функция извлечения сущностей из результатов анализа для поиска противоречий
function extractEntitiesFromAnalysis(contractParagraphs: ContractParagraph[]): Array<{
  id: string;
  text: string;
  entityType: 'срок' | 'ответственность' | 'пеня' | 'неустойка' | 'сумма' | 'количество' | 'процент';
  value: string;
  context: string;
}> {
  const entities: Array<{
    id: string;
    text: string;
    entityType: 'срок' | 'ответственность' | 'пеня' | 'неустойка' | 'сумма' | 'количество' | 'процент';
    value: string;
    context: string;
  }> = [];

  console.log(`🔍 Начинаем извлечение сущностей из ${contractParagraphs.length} абзацев`);

  // Регулярные выражения для поиска различных типов сущностей
  const patterns = {
    срок: /(\d+)\s*(дн|день|дня|дней|календарн|рабоч|месяц|год)/gi,
    процент: /(\d+(?:[.,]\d+)?)\s*%|\d+(?:[.,]\d+)?\s*процент/gi,
    сумма: /(\d+(?:\s?\d{3})*(?:[.,]\d+)?)\s*(руб|рубл|коп|тыс|млн|тысяч|миллион)/gi,
    ответственность: /(ответственность|обязательство|обязанность|штраф|санкции)/gi,
    пеня: /(пеня|пени|неустойка|штраф)/gi
  };

  contractParagraphs.forEach(paragraph => {
    const text = paragraph.text.toLowerCase();
    
    // Поиск сроков
    let srokMatch;
    const srokPattern = /(\d+)\s*(дн|день|дня|дней|календарн|рабоч|месяц|год)/gi;
    while ((srokMatch = srokPattern.exec(text)) !== null) {
      entities.push({
        id: paragraph.id,
        text: paragraph.text,
        entityType: 'срок',
        value: srokMatch[0],
        context: paragraph.text.substring(Math.max(0, srokMatch.index! - 50), srokMatch.index! + srokMatch[0].length + 50)
      });
    }

    // Поиск процентов
    let percentMatch;
    const percentPattern = /(\d+(?:[.,]\d+)?)\s*%|\d+(?:[.,]\d+)?\s*процент/gi;
    while ((percentMatch = percentPattern.exec(text)) !== null) {
      entities.push({
        id: paragraph.id,
        text: paragraph.text,
        entityType: 'процент',
        value: percentMatch[0],
        context: paragraph.text.substring(Math.max(0, percentMatch.index! - 50), percentMatch.index! + percentMatch[0].length + 50)
      });
    }

    // Поиск сумм
    let sumMatch;
    const sumPattern = /(\d+(?:\s?\d{3})*(?:[.,]\d+)?)\s*(руб|рубл|коп|тыс|млн|тысяч|миллион)/gi;
    while ((sumMatch = sumPattern.exec(text)) !== null) {
      entities.push({
        id: paragraph.id,
        text: paragraph.text,
        entityType: 'сумма',
        value: sumMatch[0],
        context: paragraph.text.substring(Math.max(0, sumMatch.index! - 50), sumMatch.index! + sumMatch[0].length + 50)
      });
    }

    // Поиск ответственности и пени
    if (patterns.ответственность.test(text) || patterns.пеня.test(text)) {
      entities.push({
        id: paragraph.id,
        text: paragraph.text,
        entityType: 'ответственность',
        value: text.match(patterns.процент)?.[0] || text.match(patterns.сумма)?.[0] || 'не определено',
        context: paragraph.text
      });
    }
  });

  // Группируем результаты для логирования
  const entitiesByType = entities.reduce((acc, entity) => {
    if (!acc[entity.entityType]) acc[entity.entityType] = 0;
    acc[entity.entityType]++;
    return acc;
  }, {} as Record<string, number>);

  console.log(`📊 Извлечено сущностей по типам:`, entitiesByType);
  console.log(`📈 Всего извлечено сущностей: ${entities.length}`);

  // Показываем примеры найденных сущностей
  Object.keys(entitiesByType).forEach(type => {
    const exampleEntities = entities.filter(e => e.entityType === type).slice(0, 2);
    if (exampleEntities.length > 0) {
      console.log(`💡 Примеры сущностей типа "${type}":`, 
        exampleEntities.map(e => `${e.value} (${e.id})`)
      );
    }
  });

  return entities;
}

// Поиск потенциальных противоречий между сущностями
function findPotentialContradictions(entities: Array<{
  id: string;
  text: string;
  entityType: string;
  value: string;
  context: string;
}>): Array<{
  entity1: any;
  entity2: any;
  type: 'temporal' | 'financial' | 'quantitative' | 'legal';
}> {
  const potentialContradictions: Array<{
    entity1: any;
    entity2: any;
    type: 'temporal' | 'financial' | 'quantitative' | 'legal';
  }> = [];

  // Группируем сущности по типу
  const entitiesByType = entities.reduce((acc, entity) => {
    if (!acc[entity.entityType]) acc[entity.entityType] = [];
    acc[entity.entityType].push(entity);
    return acc;
  }, {} as Record<string, any[]>);

  console.log('🔍 Анализ сущностей по типам:', Object.keys(entitiesByType).map(type => `${type}: ${entitiesByType[type].length}`));

  // Ищем противоречия в сроках
  if (entitiesByType.срок && entitiesByType.срок.length > 1) {
    console.log(`🕐 Анализируем ${entitiesByType.срок.length} сроков на противоречия`);
    for (let i = 0; i < entitiesByType.срок.length; i++) {
      for (let j = i + 1; j < entitiesByType.срок.length; j++) {
        const entity1 = entitiesByType.срок[i];
        const entity2 = entitiesByType.срок[j];
        
        // Проверяем, если контексты похожи, но значения разные
        if (entity1.id !== entity2.id && entity1.value !== entity2.value) {
          const context1Words = entity1.context.toLowerCase().split(/\s+/).filter((word: string) => word.length > 3);
          const context2Words = entity2.context.toLowerCase().split(/\s+/).filter((word: string) => word.length > 3);
          const commonWords = context1Words.filter((word: string) => 
            context2Words.includes(word) && !['этом', 'того', 'этого', 'которые', 'которых', 'может', 'должен', 'должна', 'может', 'будет'].includes(word)
          );
          
          // Увеличиваем порог для более точного поиска
          if (commonWords.length >= 3 || 
              (commonWords.length >= 2 && (
                entity1.context.includes('поставка') && entity2.context.includes('поставка') ||
                entity1.context.includes('платеж') && entity2.context.includes('платеж') ||
                entity1.context.includes('оплата') && entity2.context.includes('оплата')
              ))) {
            console.log(`🎯 Найдено потенциальное временное противоречие: ${entity1.value} vs ${entity2.value}, общих слов: ${commonWords.length}`);
            potentialContradictions.push({
              entity1,
              entity2,
              type: 'temporal'
            });
          }
        }
      }
    }
  }

  // Ищем противоречия в процентах
  if (entitiesByType.процент && entitiesByType.процент.length > 1) {
    console.log(`💰 Анализируем ${entitiesByType.процент.length} процентов на противоречия`);
    for (let i = 0; i < entitiesByType.процент.length; i++) {
      for (let j = i + 1; j < entitiesByType.процент.length; j++) {
        const entity1 = entitiesByType.процент[i];
        const entity2 = entitiesByType.процент[j];
        
        if (entity1.id !== entity2.id && entity1.value !== entity2.value) {
          // Извлекаем числовые значения для сравнения
          const num1 = parseFloat(entity1.value.replace(/[^\d.,]/g, '').replace(',', '.'));
          const num2 = parseFloat(entity2.value.replace(/[^\d.,]/g, '').replace(',', '.'));
          
          // Если значения значительно отличаются и контексты похожи
          if (!isNaN(num1) && !isNaN(num2) && Math.abs(num1 - num2) > 0.1) {
            const context1Words = entity1.context.toLowerCase().split(/\s+/).filter((word: string) => word.length > 3);
            const context2Words = entity2.context.toLowerCase().split(/\s+/).filter((word: string) => word.length > 3);
            const commonWords = context1Words.filter((word: string) => 
              context2Words.includes(word) && !['этом', 'того', 'этого', 'которые', 'которых'].includes(word)
            );
            
            if (commonWords.length >= 2 || 
                (entity1.context.includes('неустойка') && entity2.context.includes('неустойка')) ||
                (entity1.context.includes('пеня') && entity2.context.includes('пеня')) ||
                (entity1.context.includes('штраф') && entity2.context.includes('штраф'))) {
              console.log(`🎯 Найдено потенциальное количественное противоречие: ${entity1.value} vs ${entity2.value}`);
              potentialContradictions.push({
                entity1,
                entity2,
                type: 'quantitative'
              });
            }
          }
        }
      }
    }
  }

  // Ищем противоречия в ответственности
  if (entitiesByType.ответственность && entitiesByType.ответственность.length > 1) {
    console.log(`⚖️ Анализируем ${entitiesByType.ответственность.length} пунктов ответственности на противоречия`);
    for (let i = 0; i < entitiesByType.ответственность.length; i++) {
      for (let j = i + 1; j < entitiesByType.ответственность.length; j++) {
        const entity1 = entitiesByType.ответственность[i];
        const entity2 = entitiesByType.ответственность[j];
        
        if (entity1.id !== entity2.id && entity1.value !== entity2.value && 
            entity1.value !== 'не определено' && entity2.value !== 'не определено') {
          console.log(`🎯 Найдено потенциальное финансовое противоречие: ${entity1.value} vs ${entity2.value}`);
          potentialContradictions.push({
            entity1,
            entity2,
            type: 'financial'
          });
        }
      }
    }
  }

  console.log(`📊 Итого найдено потенциальных противоречий: ${potentialContradictions.length}`);
  return potentialContradictions;
}

// Верификация противоречий через AI
async function verifyContradictionWithAI(
  potential: {
    entity1: any;
    entity2: any;
    type: 'temporal' | 'financial' | 'quantitative' | 'legal';
  },
  perspective: 'buyer' | 'supplier'
): Promise<any | null> {
  try {
    const keyToUse = keyPool.getNextKey();
    const genAI = new GoogleGenerativeAI(keyToUse);
    const model = genAI.getGenerativeModel({ 
      model: MODEL_NAME,
      systemInstruction: `Ты - эксперт по анализу договоров. Проверяй только реальные противоречия.`
    });

    const verificationPrompt = `Проанализируй два пункта договора на предмет противоречия:

ПУНКТ 1: "${potential.entity1.text.substring(0, 500)}"
ЗНАЧЕНИЕ 1: ${potential.entity1.value}

ПУНКТ 2: "${potential.entity2.text.substring(0, 500)}"  
ЗНАЧЕНИЕ 2: ${potential.entity2.value}

Эти пункты действительно противоречат друг другу? Отвечай только JSON:

{
  "isContradiction": true/false,
  "severity": "high"/"medium"/"low", 
  "explanation": "Краткое объяснение",
  "recommendation": "Краткая рекомендация"
}`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: verificationPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4000, // Увеличиваем лимит токенов
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const rawResponse = result.response.text();
    console.log(`🔍 Верификация противоречия: ${rawResponse.substring(0, 200)}`);
    
    const verification = extractJsonFromResponse(rawResponse);
    
    if (verification.isContradiction) {
      return {
        id: `contradiction_${potential.entity1.id}_${potential.entity2.id}`,
        type: potential.type,
        description: verification.explanation,
        conflictingParagraphs: {
          paragraph1: {
            text: potential.entity1.text,
            value: potential.entity1.value
          },
          paragraph2: {
            text: potential.entity2.text,
            value: potential.entity2.value
          }
        },
        severity: verification.severity,
        recommendation: verification.recommendation
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Ошибка при верификации противоречия:', error);
    
    // Если ошибка связана с исчерпанием квоты, отмечаем ключ
    if (error instanceof Error && error.message.includes('429')) {
      const keyToUse = keyPool.getNextKey();
      keyPool.markKeyAsExhausted(keyToUse);
    }
    
    return null;
  }
}

// Функция поиска противоречий между пунктами договора (улучшенная AI-версия)
async function findContradictions(
  allAnalysis: any[],
  paragraphs: Array<{ id: string; text: string }>,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  // onProgress уже вызван в основной функции
  
  // Подготавливаем данные по каждому проанализированному пункту с полными текстами
  const analyzedSummary = allAnalysis
    .filter(item => item.category && item.category !== null)
    .map(item => {
      const paragraph = paragraphs.find(p => p.id === item.id);
      return {
        id: item.id,
        text: paragraph?.text || '', // Сохраняем полный текст для точного анализа противоречий
        category: item.category,
        comment: item.comment?.substring(0, 150) || null // Немного увеличиваем лимит комментариев
      };
    })
    .slice(0, 25); // Немного уменьшаем количество пунктов из-за увеличенного размера

  // Если анализированных пунктов мало, не ищем противоречия
  if (analyzedSummary.length < 3) {
    console.log("🔍 Недостаточно пунктов для поиска противоречий");
    return { contradictions: [] };
  }

  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  const contradictionsPrompt = `Перед тобой анализ ключевых пунктов договора. Твоя задача — найти пары пунктов, которые прямо или косвенно противоречат друг другу.

АНАЛИЗИРОВАННЫЕ ПУНКТЫ:
${JSON.stringify(analyzedSummary, null, 2)}

Ищи противоречия в:
- **Сроках** (разные сроки для одинаковых процедур)
- **Суммах и процентах** (разные размеры штрафов/пени для аналогичных нарушений)
- **Ответственности** (кто за что отвечает, пересекающиеся зоны ответственности)
- **Условиях расторжения или изменения** (конфликтующие основания)
- **Юридических требованиях** (противоречащие нормы и процедуры)
- **Процедурных конфликтах** (наличие двух разных механизмов для одной цели, которые ослабляют друг друга). 
  ПРИМЕР: если есть право расторжения за нарушение (п. 7.5) И право расторжения без причины (п. 7.8), это процедурный конфликт - зачем сложная процедура, если можно расторгнуть без причины?
- **Логических несоответствиях** (пункты, которые делают друг друга бессмысленными или неприменимыми)
- **Приоритетных конфликтах** (когда неясно, какой пункт имеет преимущество при столкновении)

ОСОБОЕ ВНИМАНИЕ к тонким противоречиям:
- Разные процедуры для одного результата
- Пункты, которые обходят или нейтрализуют другие пункты
- Конфликты между общими и специальными нормами

Если противоречий нет, верни пустой массив. Если есть - укажи до 7 самых критичных.

ВАЖНО: В поле "text" для каждого пункта верни ПОЛНЫЙ текст пункта договора, а не сокращенную версию. Это критически важно для пользователя.

Верни JSON:
{
  "contradictions": [
    {
      "id": "contr_1",
      "type": "temporal",
      "description": "Краткое описание противоречия (до 150 символов)",
      "conflictingParagraphs": {
        "paragraph1": {
          "text": "ПОЛНЫЙ текст первого пункта договора без сокращений",
          "value": "Значение 1"
        },
        "paragraph2": {
          "text": "ПОЛНЫЙ текст второго пункта договора без сокращений", 
          "value": "Значение 2"
        }
      },
      "severity": "high",
      "recommendation": "Краткая рекомендация (до 120 символов)"
    }
  ]
}

Типы противоречий: 
- "temporal" (временные)
- "financial" (финансовые) 
- "quantitative" (количественные)
- "legal" (правовые)
- "procedural" (процедурные конфликты)
- "logical" (логические несоответствия)
- "priority" (приоритетные конфликты)

Уровни серьезности: "high", "medium", "low"`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: contradictionsPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 8000, // Максимум для Gemini 2.5 Flash
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const rawResponse = result.response.text();
    console.log("🔍 Сырой ответ поиска противоречий:", rawResponse.substring(0, 300));
    
    if (!rawResponse || rawResponse.trim() === '') {
      console.log("⚠️ Пустой ответ при поиске противоречий");
      return { contradictions: [] };
    }
    
    const parsedResult = extractJsonFromResponse(rawResponse);
    const contradictions = parsedResult.contradictions || [];
    
    console.log(`🔍 Найдено противоречий: ${contradictions.length}`);
    return { contradictions };
    
  } catch (error) {
    console.error("❌ Ошибка при поиске противоречий:", error);
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
      console.log("🔑 Ключ исчерпан при поиске противоречий");
    }
    return { contradictions: [] };
  }
}

// Интеллектуальная приоритизация пунктов для анализа дисбаланса прав
function getPrioritizedItemsForRightsAnalysis(
  allAnalysis: any[],
  paragraphs: Array<{ id: string; text: string }>,
  perspective: 'buyer' | 'supplier',
  maxItems: number = 25
): any[] {
  console.log('🔍 Приоритизация пунктов для анализа дисбаланса прав...');

  // Ключевые слова по типам прав (с весами важности)
  const rightsKeywords = {
    termination: { 
      keywords: ['расторжен', 'расторгнуть', 'отказаться от договора', 'прекратить действие', 'досрочное расторжение'], 
      weight: 20 
    },
    liability: { 
      keywords: ['ответственность', 'неустойка', 'пеня', 'штраф', 'убытки', 'возмещение', 'компенсация'], 
      weight: 18 
    },
    modification: { 
      keywords: ['в одностороннем порядке', 'изменить цену', 'увеличить стоимость', 'пересмотр условий', 'корректировка'], 
      weight: 16 
    },
    control: { 
      keywords: ['контроль', 'проверка', 'инспекция', 'аудит', 'мониторинг', 'надзор'], 
      weight: 14 
    },
    suspension: { 
      keywords: ['приостановить', 'приостановка', 'временно прекратить', 'заморозить'], 
      weight: 12 
    },
    refusal: { 
      keywords: ['отказ', 'отклонить', 'не принимать', 'вернуть'], 
      weight: 10 
    }
  };

  // Дополнительные веса в зависимости от перспективы
  const perspectiveBonus = perspective === 'buyer' ? 
    ['поставщик обязан', 'покупатель вправе', 'покупатель может'] :
    ['покупатель обязан', 'поставщик вправе', 'поставщик может'];

  const prioritized = allAnalysis
    .map(item => {
      const paragraph = paragraphs.find(p => p.id === item.id);
      const fullText = paragraph?.text || '';
      const analysisText = (item.comment || '') + ' ' + (item.recommendation || '');
      const combinedText = (fullText + ' ' + analysisText).toLowerCase();
      
      let score = 0;

      // 1. Базовый приоритет по категории
      if (item.category === 'risk') score += 15;
      if (item.category === 'deemed_acceptance') score += 12;
      if (item.category === 'partial') score += 8;
      if (item.category === 'checklist') score += 5;

      // 2. Приоритет по ключевым словам прав
      Object.values(rightsKeywords).forEach(({ keywords, weight }) => {
        const hasKeyword = keywords.some(keyword => combinedText.includes(keyword));
        if (hasKeyword) score += weight;
      });

      // 3. Бонус за перспективу
      perspectiveBonus.forEach(phrase => {
        if (combinedText.includes(phrase)) score += 8;
      });

      // 4. Бонус за длину анализа (более детальный анализ = важнее)
      if (analysisText.length > 100) score += 5;
      if (analysisText.length > 200) score += 3;

      // 5. Штраф за слишком общие формулировки
      const genericPhrases = ['в соответствии с', 'согласно законодательству', 'стороны договорились'];
      const hasGeneric = genericPhrases.some(phrase => combinedText.includes(phrase));
      if (hasGeneric && score < 10) score -= 3;

      return {
        id: item.id,
        text: fullText.substring(0, 200) + (fullText.length > 200 ? '...' : ''),
        category: item.category,
        comment: item.comment?.substring(0, 150) || null,
        recommendation: item.recommendation?.substring(0, 100) || null,
        score: Math.max(0, score) // Не даем отрицательные баллы
      };
    })
    .filter(item => item.score > 0) // Отбрасываем нерелевантные пункты
    .sort((a, b) => b.score - a.score); // Сортируем по убыванию значимости

  console.log(`📊 Топ-5 самых значимых пунктов:`, 
    prioritized.slice(0, 5).map(p => ({ 
      id: p.id, 
      score: p.score, 
      category: p.category,
      preview: p.comment?.substring(0, 40) + '...' 
    }))
  );

  console.log(`📈 Статистика приоритизации: всего ${allAnalysis.length} → отобрано ${Math.min(prioritized.length, maxItems)} пунктов`);

  return prioritized.slice(0, maxItems);
}

// Поиск структурных дефектов и опечаток в договоре
async function findStructuralDefects(
  paragraphs: Array<{ id: string; text: string }>,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any[]> {
  console.log("🔍 Начинаем поиск структурных дефектов...");
  
  const defects: any[] = [];
  
  // Шаг 1: Создаем карту всех существующих пунктов договора
  const clauseMap = new Map<string, { id: string; text: string; number: string }>();
  const clauseNumbers = new Set<string>();
  
  paragraphs.forEach(p => {
    // Извлекаем номер пункта из начала текста (1., 2.1., 10.2.1. и т.д.)
    const match = p.text.match(/^(\d+(?:\.\d+)*\.?)\s/);
    if (match) {
      const clauseNumber = match[1].replace(/\.$/, ''); // Убираем точку в конце
      clauseMap.set(clauseNumber, { id: p.id, text: p.text, number: clauseNumber });
      clauseNumbers.add(clauseNumber);
    }
  });

  console.log(`📋 Найдено пунктов с номерами: ${clauseNumbers.size}`);

  // Шаг 2: Находим все ссылки на другие пункты в тексте
  const referenceRegex = /(?:п|пункт|пункте|пункту|пунктом|пунктах|подпункт|подпункте)\.?\s*(\d+(?:\.\d+)*\.?)/gi;
  
  for (const paragraph of paragraphs) {
    const matches = Array.from(paragraph.text.matchAll(referenceRegex));
    
    for (const match of matches) {
      const referencedClauseNumber = match[1].replace(/\.$/, ''); // Убираем точку
      const fullMatch = match[0];
      
      // Шаг 3: Проверяем "битые" ссылки
      if (!clauseNumbers.has(referencedClauseNumber)) {
        // Ищем похожие номера для предложения исправления
        const similarNumbers = Array.from(clauseNumbers).filter(num => 
          num.startsWith(referencedClauseNumber.split('.')[0]) || 
          referencedClauseNumber.startsWith(num.split('.')[0])
        );
        
        defects.push({
          id: `broken_ref_${paragraph.id}_${referencedClauseNumber}`,
          type: 'broken_reference',
          description: `Ссылка на несуществующий пункт ${referencedClauseNumber} в тексте: "${fullMatch}"`,
          severity: 'high',
          recommendation: similarNumbers.length > 0 
            ? `Возможно, имелся в виду пункт: ${similarNumbers.slice(0, 3).join(', ')}`
            : `Проверить корректность ссылки на пункт ${referencedClauseNumber}`,
          location: paragraph.id,
          context: paragraph.text.substring(Math.max(0, match.index! - 50), match.index! + 100)
        });
      }
      
      // Шаг 4: Проверяем самоссылки (пункт ссылается сам на себя)
      const currentClauseMatch = paragraph.text.match(/^(\d+(?:\.\d+)*\.?)\s/);
      if (currentClauseMatch) {
        const currentClauseNumber = currentClauseMatch[1].replace(/\.$/, '');
        if (referencedClauseNumber === currentClauseNumber) {
          defects.push({
            id: `self_ref_${paragraph.id}`,
            type: 'self_reference',
            description: `Пункт ${currentClauseNumber} ссылается сам на себя`,
            severity: 'medium',
            recommendation: `Проверить логичность самоссылки или исправить на корректный пункт`,
            location: paragraph.id,
            context: paragraph.text.substring(0, 200)
          });
        }
      }
    }
  }

  // Шаг 5: Специфические проверки с помощью AI для сложных случаев
  if (defects.length < 10) { // Вызываем AI только если не слишком много простых дефектов
    try {
      const aiDefects = await findLogicalDefectsWithAI(paragraphs, clauseMap, perspective);
      defects.push(...aiDefects);
    } catch (error) {
      console.error("❌ Ошибка AI-анализа структурных дефектов:", error);
    }
  }

  // Шаг 6: Поиск циклических ссылок
  const cyclicDefects = findCyclicReferences(paragraphs, clauseMap);
  defects.push(...cyclicDefects);

  console.log(`✅ Найдено структурных дефектов: ${defects.length}`);
  return defects;
}

// AI-анализ логических дефектов
async function findLogicalDefectsWithAI(
  paragraphs: Array<{ id: string; text: string }>,
  clauseMap: Map<string, any>,
  perspective: 'buyer' | 'supplier'
): Promise<any[]> {
  // Ищем подозрительные паттерны для AI-анализа
  const suspiciousParagraphs = paragraphs.filter(p => {
    const text = p.text.toLowerCase();
    return text.includes('нарушение положений п.') || 
           text.includes('в соответствии с п.') ||
           text.includes('согласно п.') ||
           (text.includes('ответственность') && text.includes('п.'));
  });

  if (suspiciousParagraphs.length === 0) return [];

  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по структурному анализу договоров.`
  });

  const logicalPrompt = `Проанализируй следующие пункты договора на предмет логических ошибок в ссылках:

ПУНКТЫ ДЛЯ АНАЛИЗА:
${suspiciousParagraphs.map(p => `${p.id}: ${p.text.substring(0, 300)}`).join('\n\n')}

ДОСТУПНЫЕ ПУНКТЫ В ДОГОВОРЕ:
${Array.from(clauseMap.keys()).sort().join(', ')}

Найди логические ошибки:
1. Пункты об ответственности, которые ссылаются сами на себя вместо пунктов с обязательствами
2. Ссылки на неподходящие по смыслу пункты
3. Отсутствие ссылок там, где они логически необходимы

Верни JSON:
{
  "logicalDefects": [
    {
      "id": "logic_error_1",
      "type": "logical_error",
      "description": "Описание логической ошибки",
      "severity": "high",
      "recommendation": "Как исправить",
      "location": "id пункта"
    }
  ]
}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: logicalPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 4000,
      },
    });

    const rawResponse = result.response.text();
    const parsed = extractJsonFromResponse(rawResponse);
    return parsed.logicalDefects || [];
  } catch (error) {
    console.error("❌ Ошибка AI-анализа логических дефектов:", error);
    return [];
  }
}

// Поиск циклических ссылок
function findCyclicReferences(
  paragraphs: Array<{ id: string; text: string }>,
  clauseMap: Map<string, any>
): any[] {
  const defects: any[] = [];
  const referenceGraph = new Map<string, string[]>();

  // Строим граф ссылок
  paragraphs.forEach(p => {
    const currentMatch = p.text.match(/^(\d+(?:\.\d+)*\.?)\s/);
    if (!currentMatch) return;
    
    const currentClause = currentMatch[1].replace(/\.$/, '');
    const references: string[] = [];
    
    const referenceRegex = /(?:п|пункт|пункте|пункту)\.?\s*(\d+(?:\.\d+)*\.?)/gi;
    let match;
    while ((match = referenceRegex.exec(p.text)) !== null) {
      const refClause = match[1].replace(/\.$/, '');
      if (refClause !== currentClause) {
        references.push(refClause);
      }
    }
    
    if (references.length > 0) {
      referenceGraph.set(currentClause, references);
    }
  });

  // Ищем циклы (простая проверка A->B->A)
  for (const [clause, refs] of Array.from(referenceGraph.entries())) {
    for (const ref of refs) {
      const refRefs = referenceGraph.get(ref);
      if (refRefs && refRefs.includes(clause)) {
        defects.push({
          id: `cycle_${clause}_${ref}`,
          type: 'cyclic_reference',
          description: `Обнаружена циклическая ссылка: пункт ${clause} ссылается на ${ref}, который ссылается обратно на ${clause}`,
          severity: 'medium',
          recommendation: `Пересмотреть логику ссылок между пунктами ${clause} и ${ref}`,
          location: clause
        });
      }
    }
  }

  return defects;
}

// Новая функция агрегации и анализа прав с взвешиванием (гибридный подход)
function analyzeRightsImbalanceProgrammatically(
  classifiedClauses: Array<{ id: string; party: string; type: string }>,
  allParagraphs: Array<{ id: string; text: string }>
): any {
  console.log(`🔍 Шаг 5.2: Взвешенный программный анализ дисбаланса...`);
  
  const rightsImbalance: any[] = [];
  const buyerClauses = classifiedClauses.filter(c => c.party === 'buyer');
  const supplierClauses = classifiedClauses.filter(c => c.party === 'supplier');
  const bothClauses = classifiedClauses.filter(c => c.party === 'both');

  const typeNames = {
    termination: "расторжения договора",
    modification: "изменения условий",
    liability: "финансовой ответственности",
    control: "контроля и приемки",
    procedural: "процедурных прав"
  };

  // --- 1. АНАЛИЗ ОТВЕТСТВЕННОСТИ (LIABILITY) ---
  const buyerLiability = buyerClauses.filter(c => c.type === 'liability');
  const supplierLiability = supplierClauses.filter(c => c.type === 'liability');
  
  if (supplierLiability.length > 0 || buyerLiability.length > 0) {
    const buyerPenalty = extractFinancialValue(buyerLiability.map(c => allParagraphs.find(p => p.id === c.id)?.text || ''));
    const supplierPenalty = extractFinancialValue(supplierLiability.map(c => allParagraphs.find(p => p.id === c.id)?.text || ''));
    
    let isImbalanced = false;
    let description = `Анализ финансовой ответственности. Прав Поставщика: ${supplierLiability.length}, прав Покупателя: ${buyerLiability.length}.`;
    let severity = 'low';

    if (supplierPenalty > buyerPenalty * 2 && buyerPenalty >= 0) {
      isImbalanced = true;
      description = `Обнаружен критический дисбаланс ответственности: санкции, которые может применить Поставщик (например, пеня ${supplierPenalty}%), значительно выше санкций, доступных Покупателю (например, неустойка ${buyerPenalty}%).`;
      severity = 'high';
    } else if (supplierLiability.length > buyerLiability.length + 1) {
        isImbalanced = true;
        description = `Обнаружен количественный дисбаланс в правах на взыскание: у Поставщика (${supplierLiability.length}) больше инструментов для наложения санкций, чем у Покупателя (${buyerLiability.length}).`
        severity = 'medium';
    }

    if (isImbalanced) {
      rightsImbalance.push({
        id: `imbalance_liability`, type: 'liability', description, severity,
        buyerRights: buyerLiability.length, supplierRights: supplierLiability.length,
        recommendation: `Рекомендуется пересмотреть размеры и основания для неустоек, чтобы обеспечить соразмерность финансовой ответственности сторон.`,
        buyerRightsClauses: buyerLiability.map(c => allParagraphs.find(p => p.id === c.id)),
        supplierRightsClauses: supplierLiability.map(c => allParagraphs.find(p => p.id === c.id)),
      });
    }
  }

  // --- 2. АНАЛИЗ ДРУГИХ КАТЕГОРИЙ (Modification, Termination, Control) ---
  const typesToAnalyze: Array<keyof typeof typeNames> = ['modification', 'termination', 'control'];
  
  typesToAnalyze.forEach(type => {
      const buyerRights = buyerClauses.filter(c => c.type === type);
      const supplierRights = supplierClauses.filter(c => c.type === type);
      
      // Ищем дисбаланс только если у одной стороны есть права, а у другой нет, или разница существенна
      if (Math.abs(buyerRights.length - supplierRights.length) > 0 && (buyerRights.length === 0 || supplierRights.length === 0)) {
           const favoredParty = buyerRights.length > supplierRights.length ? "Покупателя" : "Поставщика";
           const favoredPartyRus = favoredParty === "Покупателя" ? "Покупатель" : "Поставщик";
           
           rightsImbalance.push({
              id: `imbalance_${type}`, type: type,
              description: `Обнаружен дисбаланс в сфере ${typeNames[type]}: ${favoredPartyRus} имеет ${Math.max(buyerRights.length, supplierRights.length)} прав(о) в этой категории, в то время как у другой стороны их нет.`,
              severity: type === 'modification' ? 'high' : 'medium',
              buyerRights: buyerRights.length, supplierRights: supplierRights.length,
              recommendation: `Рекомендуется предоставить второй стороне симметричные права в области ${typeNames[type]} или ограничить существующие.`,
              buyerRightsClauses: buyerRights.map(c => allParagraphs.find(p => p.id === c.id)),
              supplierRightsClauses: supplierRights.map(c => allParagraphs.find(p => p.id === c.id)),
           });
      }
  });
  
  const overallConclusion = `Анализ завершен. Найдено ${rightsImbalance.length} качественных дисбалансов.`;
  return { rightsImbalance, overallConclusion };
}

// Функция агрегации прав из чанков (для совместимости)
function aggregateAndAnalyzeRights(chunkResults: any[], allParagraphs: Array<{ id: string; text: string }>): any {
  console.log(`🔄 Начинаем агрегацию прав из ${chunkResults.length} чанков`);
  
  let totalBuyerRights = 0;
  let totalSupplierRights = 0;
  const allRightsDetails: string[] = [];
  const allClassifiedClauses: Array<{ id: string; party: string; type: string }> = [];
  
  // Собираем данные из всех чанков
  chunkResults.forEach((chunkResult, index) => {
    if (chunkResult && chunkResult.chunkRightsAnalysis) {
      const rightsAnalysis = chunkResult.chunkRightsAnalysis;
      
      totalBuyerRights += rightsAnalysis.buyerRightsCount || 0;
      totalSupplierRights += rightsAnalysis.supplierRightsCount || 0;
      
      if (rightsAnalysis.rightsDetails && Array.isArray(rightsAnalysis.rightsDetails)) {
        allRightsDetails.push(...rightsAnalysis.rightsDetails);
      }
      
      // Собираем классифицированные пункты если они есть
      if (rightsAnalysis.classifiedClauses && Array.isArray(rightsAnalysis.classifiedClauses)) {
        allClassifiedClauses.push(...rightsAnalysis.classifiedClauses);
      }
      
      console.log(`  ✅ Чанк ${index + 1}: покупатель ${rightsAnalysis.buyerRightsCount || 0}, поставщик ${rightsAnalysis.supplierRightsCount || 0}`);
    } else {
      console.warn(`  ⚠️ Чанк ${index + 1}: отсутствует chunkRightsAnalysis`);
    }
  });
  
  console.log(`📊 Итого прав: покупатель ${totalBuyerRights}, поставщик ${totalSupplierRights}`);
  
  // Если у нас есть классифицированные пункты, используем взвешенный анализ
  if (allClassifiedClauses.length > 0) {
    console.log(`🎯 Переходим к взвешенному анализу с ${allClassifiedClauses.length} классифицированными пунктами`);
    // Передаём полный массив allParagraphs, не собираем его заново
    return analyzeRightsImbalanceProgrammatically(allClassifiedClauses, allParagraphs);
  }
  
  // Иначе используем простую логику (для обратной совместимости)
  const rightsImbalance: any[] = [];
  let overallConclusion = "";
  
  if (totalBuyerRights === 0 && totalSupplierRights === 0) {
    overallConclusion = "В договоре не обнаружено явных прав сторон для анализа дисбаланса.";
  } else {
    const totalRights = totalBuyerRights + totalSupplierRights;
    const buyerPercentage = Math.round((totalBuyerRights / totalRights) * 100);
    const supplierPercentage = Math.round((totalSupplierRights / totalRights) * 100);
    
    // Определяем дисбаланс
    const difference = Math.abs(totalBuyerRights - totalSupplierRights);
    const maxRights = Math.max(totalBuyerRights, totalSupplierRights);
    const imbalancePercentage = maxRights > 0 ? Math.round((difference / maxRights) * 100) : 0;
    
    if (imbalancePercentage > 50) {
      const favoredParty = totalBuyerRights > totalSupplierRights ? "покупателя" : "поставщика";
      const severity = imbalancePercentage > 75 ? "high" : "medium";
      
      rightsImbalance.push({
        id: "imbalance_1",
        type: "general_rights",
        description: `Значительный дисбаланс прав в пользу ${favoredParty}. Покупатель: ${totalBuyerRights} прав (${buyerPercentage}%), Поставщик: ${totalSupplierRights} прав (${supplierPercentage}%).`,
        buyerRights: totalBuyerRights,
        supplierRights: totalSupplierRights,
        severity: severity,
        recommendation: `Рекомендуется сбалансировать права сторон, добавив дополнительные права для ${favoredParty === "покупателя" ? "поставщика" : "покупателя"}.`
      });
      
      overallConclusion = `Обнаружен ${severity === "high" ? "критический" : "значительный"} дисбаланс прав в пользу ${favoredParty}. Соотношение: ${buyerPercentage}% к ${supplierPercentage}%.`;
    } else {
      overallConclusion = `Права сторон относительно сбалансированы. Покупатель: ${totalBuyerRights} прав (${buyerPercentage}%), Поставщик: ${totalSupplierRights} прав (${supplierPercentage}%).`;
    }
  }
  
  console.log(`✅ Агрегация завершена: найдено ${rightsImbalance.length} дисбалансов`);
  
  return {
    rightsImbalance,
    overallConclusion,
    totalBuyerRights,
    totalSupplierRights,
    allRightsDetails
  };
}

// Шаг 5.1: Улучшенная функция классификации пунктов по сторонам И типу права (гибридный подход)
async function classifyClauseParty(
  chunk: any[], // Чанк из 5 приоритетных пунктов
  perspective: 'buyer' | 'supplier'
): Promise<Array<{ id: string; party: 'buyer' | 'supplier' | 'both' | 'neutral'; type: string }>> {
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по классификации пунктов договоров поставки.`
  });

  const classifyPrompt = `Твоя задача - быть СТРОГИМ юристом. Проанализируй каждый пункт и определи, какая из сторон получает от него РЕАЛЬНОЕ ПРЕИМУЩЕСТВО или право.

ПУНКТЫ ДЛЯ АНАЛИЗА:
${chunk.map(item => `- ${item.id}: ${item.text}`).join('\n\n')}

Для КАЖДОГО пункта определи ВЫГОДОПРИОБРЕТАТЕЛЯ и ТИП права.
- "buyer": Пункт дает РЕАЛЬНОЕ, СИЛЬНОЕ право или преимущество Покупателю.
- "supplier": Пункт дает РЕАЛЬНОЕ, СИЛЬНОЕ право или преимущество Поставщику.
- "neutral": Пункт является чисто информационным, техническим или описывает ОБЯЗАННОСТЬ без предоставления явного права (например, "Покупатель обязан обеспечить подъездные пути").
- "both": Используй ТОЛЬКО для абсолютно симметричных прав (например, "каждая из сторон вправе...").

ПРИМЕРЫ ДЛЯ ОБУЧЕНИЯ:
- Текст: "Поставщик гарантирует качество..." -> party: "neutral" (это обязанность Поставщика, а не сильное право Покупателя)
- Текст: "Покупатель вправе проверить товар за свой счет..." -> party: "neutral" (право слабое, почти фиктивное, не дает реального преимущества)
- Текст: "Подписание ТН подтверждает приемку по качеству" -> party: "supplier" (это преимущество для Поставщика, так как ограничивает права Покупателя на проверку)

Используй 5 меток для ТИПА права:
- "termination": Право на расторжение или прекращение договора.
- "modification": Право на одностороннее изменение условий (цены, сроков).
- "liability": Право на взыскание штрафов, пеней, неустоек, возмещение расходов.
- "control": Право на проверку, приемку, отказ от товара.
- "procedural": Другие процедурные права (подать заявку, предложить переговоры).

Верни ТОЛЬКО JSON в формате списка:
[
  { "id": "p52", "party": "buyer", "type": "liability" },
  { "id": "p75", "party": "buyer", "type": "termination" },
  { "id": "p44", "party": "supplier", "type": "modification" }
]`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: classifyPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.0,
        maxOutputTokens: 1000,
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });
    let rawResponse = result.response.text();
    if (!rawResponse || rawResponse.trim().length === 0) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const secondTryResult = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: classifyPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.0,
            maxOutputTokens: 1000,
            topP: 0.95,
            topK: 64,
          },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ],
        });
        rawResponse = secondTryResult.response.text();
      } catch (retryError) {}
    }
    if (rawResponse && rawResponse.trim().length > 0) {
      const parsed = extractJsonFromResponse(rawResponse);
      return Array.isArray(parsed) ? parsed : [];
    } else {
      return [];
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
    }
    return [];
  }
}

// --- Вспомогательная функция для извлечения максимального процента/суммы ---
function extractFinancialValue(texts: string[]): number {
  let maxValue = 0;
  // Ищем проценты или значительные суммы в рублях
  const valueRegex = /(\d[\d\s,.]*)\s*(%|руб)/g;

  texts.forEach(text => {
    const matches = Array.from(text.matchAll(valueRegex));
    matches.forEach(match => {
      // Убираем пробелы и заменяем запятую на точку для корректного парсинга
      const numericString = match[1].replace(/\s/g, '').replace(',', '.');
      const numericValue = parseFloat(numericString);
      if (!isNaN(numericValue) && numericValue > maxValue) {
        // Простое правило: если это рубли, и сумма больше 1000, считаем ее значимой. Проценты всегда значимы.
        if (match[2] === '%' || (match[2] === 'руб' && numericValue > 1000)) {
           maxValue = numericValue;
        }
      }
    });
  });
  return maxValue;
}

// --- Новый качественный анализатор дисбаланса ---
function analyzeRightsImbalanceSmart(
  classifiedClauses: Array<{ id: string; party: string; type: string }>,
  allParagraphs: Array<{ id: string; text: string }>
): any {
  const rightsImbalance: any[] = [];
  // Добавим текст к каждому classifiedClause для анализа
  const clausesWithText = classifiedClauses.map(c => ({
    ...c,
    text: (allParagraphs.find(p => p.id === c.id)?.text || "")
  }));
  const buyerClauses = clausesWithText.filter(c => c.party === 'buyer');
  const supplierClauses = clausesWithText.filter(c => c.party === 'supplier');

  // --- АНАЛИЗ ОТВЕТСТВЕННОСТИ (LIABILITY) ---
  const buyerLiability = buyerClauses.filter(c => c.type === 'liability');
  const supplierLiability = supplierClauses.filter(c => c.type === 'liability');
  if (supplierLiability.length > buyerLiability.length) {
    // Извлекаем проценты
    const buyerPenaltyMatch = buyerLiability[0]?.text.match(/(\d[\d,\.]*)\s*%/);
    const supplierPenaltyMatch = supplierLiability[0]?.text.match(/(\d[\d,\.]*)\s*%/);
    const buyerPenalty = buyerPenaltyMatch ? parseFloat(buyerPenaltyMatch[1].replace(',', '.')) : 0;
    const supplierPenalty = supplierPenaltyMatch ? parseFloat(supplierPenaltyMatch[1].replace(',', '.')) : 0;
    let description = `Обнаружен дисбаланс в сфере ответственности. Прав Поставщика: ${supplierLiability.length}, прав Покупателя: ${buyerLiability.length}.`;
    if (supplierPenalty > buyerPenalty * 2 && supplierPenalty > 0) {
      description += ` Ключевой риск: пеня за просрочку оплаты Покупателем (${supplierPenalty}%) значительно выше неустойки за просрочку поставки Поставщиком (${buyerPenalty}%).`;
    }
    rightsImbalance.push({
      id: `imbalance_liability`,
      type: 'liability',
      description: description,
      buyerRights: buyerLiability.length,
      supplierRights: supplierLiability.length,
      severity: supplierPenalty > buyerPenalty * 2 ? 'high' : 'medium',
      recommendation: 'Рекомендуется сбалансировать условия ответственности и пересмотреть проценты неустоек.'
    });
  }

  // --- АНАЛИЗ ПРАВ НА ИЗМЕНЕНИЕ УСЛОВИЙ (MODIFICATION) ---
  const supplierModification = supplierClauses.filter(c => c.type === 'modification');
  if (supplierModification.length > 0) {
    rightsImbalance.push({
      id: `imbalance_modification`,
      type: 'modification',
      description: `Обнаружен критический дисбаланс: Поставщик имеет ${supplierModification.length} прав(о) на одностороннее изменение условий договора (например, цены доставки), в то время как у Покупателя таких прав нет.`,
      buyerRights: 0,
      supplierRights: supplierModification.length,
      severity: 'high',
      recommendation: 'Рекомендуется ограничить односторонние права Поставщика на изменение условий.'
    });
  }

  // --- Аналогичные блоки для termination, control и др. ---
  // termination
  const supplierTermination = supplierClauses.filter(c => c.type === 'termination');
  if (supplierTermination.length > 0) {
    rightsImbalance.push({
      id: `imbalance_termination`,
      type: 'termination',
      description: `Поставщик имеет ${supplierTermination.length} прав(о) на расторжение договора, что может создать риск для Покупателя.`,
      buyerRights: 0,
      supplierRights: supplierTermination.length,
      severity: 'medium',
      recommendation: 'Рекомендуется сбалансировать основания для расторжения.'
    });
  }
  // control
  const buyerControl = buyerClauses.filter(c => c.type === 'control');
  if (buyerControl.length > 0 && supplierClauses.filter(c => c.type === 'control').length === 0) {
    rightsImbalance.push({
      id: `imbalance_control`,
      type: 'control',
      description: `Покупатель имеет ${buyerControl.length} прав(о) на контроль и проверку товара, что может быть преимуществом для него.`,
      buyerRights: buyerControl.length,
      supplierRights: 0,
      severity: 'low',
      recommendation: 'Рекомендуется уточнить процедуры контроля, чтобы избежать злоупотреблений.'
    });
  }
  // procedural
  // ... (можно добавить аналогичный анализ для procedural)

  // --- Дублирующиеся/спорные пункты ---
  // Сравниваем тексты прав обеих сторон (простое сравнение, можно улучшить)
  const duplicates: string[] = [];
  buyerClauses.forEach(bc => {
    supplierClauses.forEach(sc => {
      if (bc.text && sc.text && bc.text.trim() === sc.text.trim()) {
        duplicates.push(bc.text.trim());
      }
    });
  });
  if (duplicates.length > 0) {
    rightsImbalance.push({
      id: 'duplicate_rights',
      type: 'duplicates',
      description: `Обнаружены пункты, которые формально присутствуют у обеих сторон: ${duplicates.slice(0,3).map(t => '"'+t.substring(0,60)+'..."').join(', ')}. Рекомендуется уточнить формулировки этих пунктов, чтобы избежать неоднозначной трактовки и споров.`,
      buyerRights: duplicates.length,
      supplierRights: duplicates.length,
      severity: 'medium',
      recommendation: 'Уточните формулировки дублирующихся пунктов.'
    });
  }

  const overallConclusion = `Анализ завершен. Найдено ${rightsImbalance.length} качественных дисбалансов.`;
  return { rightsImbalance, overallConclusion };
}

// Шаг 5.2: Анализ дисбаланса на основе извлеченных прав (фокусированная задача)
async function analyzeRightsImbalance(
  extractedRights: { buyerRightsList: string[], supplierRightsList: string[] },
  perspective: 'buyer' | 'supplier'
): Promise<any> {
  console.log(`🔍 Шаг 5.2: Анализ дисбаланса на основе извлеченных прав`);
  
  if (extractedRights.buyerRightsList.length === 0 && extractedRights.supplierRightsList.length === 0) {
    return { 
      rightsImbalance: [], 
      overallConclusion: "Не удалось извлечь достаточно прав для анализа дисбаланса." 
    };
  }

  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу дисбаланса прав в договорах поставки.`
  });

  const analysisPrompt = `Проанализируй извлеченные права сторон и определи дисбалансы.

ПРАВА ПОКУПАТЕЛЯ (${extractedRights.buyerRightsList.length}):
${extractedRights.buyerRightsList.map((right, i) => `${i + 1}. ${right}`).join('\n')}

ПРАВА ПОСТАВЩИКА (${extractedRights.supplierRightsList.length}):
${extractedRights.supplierRightsList.map((right, i) => `${i + 1}. ${right}`).join('\n')}

Найди дисбалансы в областях:
- termination_rights (права расторжения)
- modification_rights (права изменения условий)
- liability_rights (права взыскания штрафов/неустоек)
- suspension_rights (права приостановки)
- control_rights (контрольные права)

Верни JSON:
{
  "rightsImbalance": [
    {
      "id": "imbalance_1",
      "type": "liability_rights",
      "description": "Конкретное описание дисбаланса с примерами из списков прав",
      "buyerRights": ${extractedRights.buyerRightsList.length},
      "supplierRights": ${extractedRights.supplierRightsList.length},
      "severity": "high",
      "recommendation": "Конкретная рекомендация по выравниванию"
    }
  ],
  "overallConclusion": "Краткий вывод о том, в чью сторону смещен баланс и в каких областях"
}

ВАЖНО: Анализируй только предоставленные права, не выдумывай дисбалансы.`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: analysisPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 3000, // Еще меньше для фокусированной задачи
        topP: 0.95,
        topK: 64,
      },
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    });

    const rawResponse = result.response.text();
    console.log(`📊 Шаг 5.2: Получен ответ длиной ${rawResponse.length} символов`);
    
    const parsed = extractJsonFromResponse(rawResponse);
    const rightsImbalance = parsed.rightsImbalance || [];
    const overallConclusion = parsed.overallConclusion || "Анализ дисбаланса прав завершен.";
    
    console.log(`✅ Шаг 5.2: Найдено дисбалансов: ${rightsImbalance.length}`);
    return { rightsImbalance, overallConclusion };
    
  } catch (error) {
    console.error("❌ Ошибка анализа дисбаланса:", error);
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
    }
    return { 
      rightsImbalance: [], 
      overallConclusion: "Анализ дисбаланса прав не удался из-за технической ошибки." 
    };
  }
}

// Функция анализа дисбаланса прав между сторонами (подход "Извлеки-и-пометь")
async function findRightsImbalance(
  allAnalysis: any[],
  paragraphs: Array<{ id: string; text: string }>,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  console.log(`🔄 НАЧАЛО функции findRightsImbalance: Анализ дисбаланса прав методом "Извлеки-и-пометь"`);
  // Используем интеллектуальную приоритизацию
  const rightsRelatedItems = getPrioritizedItemsForRightsAnalysis(allAnalysis, paragraphs, perspective);
  if (rightsRelatedItems.length < 3) {
    console.log("🔍 Недостаточно релевантных пунктов для анализа дисбаланса прав");
    return { rightsImbalance: [], overallConclusion: "Недостаточно данных для анализа дисбаланса прав между сторонами." };
  }
  try {
    // ШАГ 5.1: Классифицируем пункты по сторонам (новый подход "Извлеки-и-пометь")
    console.log(`🔄 Запуск Шага 5.1: Классификация пунктов по сторонам`);
    const CHUNK_SIZE = 5;
    let classifiedClauses: any[] = [];
    const totalChunks = Math.ceil(rightsRelatedItems.length / CHUNK_SIZE);
    for (let i = 0; i < rightsRelatedItems.length; i += CHUNK_SIZE) {
      const chunk = rightsRelatedItems.slice(i, i + CHUNK_SIZE);
      console.log(`  -> Классифицируем чанк №${Math.floor(i / CHUNK_SIZE) + 1} (пункты ${i + 1}-${i + chunk.length})`);
      const classifications = await classifyClauseParty(chunk, perspective);
      if (classifications.length > 0) {
        classifiedClauses.push(...classifications);
        console.log(`  ✅ Классифицировано ${classifications.length} пунктов в чанке №${Math.floor(i / CHUNK_SIZE) + 1}`);
      } else {
        console.warn(`  ⚠️ Чанк №${Math.floor(i / CHUNK_SIZE) + 1} не дал результатов классификации`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      // --- Прогресс для этапа 5 ---
      const percent = Math.round(((i + CHUNK_SIZE) / rightsRelatedItems.length) * 100);
      onProgress(`Этап 5/7: Анализ дисбаланса прав... ${Math.min(percent, 100)}% завершено`);
    }
    // ПРОГРАММНО СОЗДАЕМ СПИСКИ ПРАВ НА ОСНОВЕ КЛАССИФИКАЦИИ
    const extractedRights = { buyerRightsList: [] as string[], supplierRightsList: [] as string[] };
    classifiedClauses.forEach(classified => {
      const originalItem = rightsRelatedItems.find(item => item.id === classified.id);
      if (originalItem) {
        const summary = `${originalItem.text.substring(0, 80)}...`;
        if (classified.party === 'buyer') {
          extractedRights.buyerRightsList.push(summary);
        } else if (classified.party === 'supplier') {
          extractedRights.supplierRightsList.push(summary);
        }
      }
    });
    console.log(`✅ Шаг 5.1 ЗАВЕРШЕН: Всего классифицировано прав покупателя: ${extractedRights.buyerRightsList.length}, поставщика: ${extractedRights.supplierRightsList.length}`);
    if (extractedRights.buyerRightsList.length === 0 && extractedRights.supplierRightsList.length === 0) {
      console.log("⚠️ Не удалось классифицировать права из пунктов договора");
      return { 
        rightsImbalance: [], 
        overallConclusion: "Не удалось извлечь достаточно прав из договора для анализа дисбаланса." 
      };
    }
    // ШАГ 5.2: Анализируем дисбаланс на основе извлеченных прав
    console.log(`🔄 Запуск Шага 5.2: Анализ дисбаланса`);
    onProgress(`Этап 5/7: Анализ дисбаланса прав... 100% завершено`);
    const imbalanceResult = await analyzeRightsImbalance(extractedRights, perspective);
    console.log(`✅ ЗАВЕРШЕНИЕ функции findRightsImbalance: Анализ "Извлеки-и-пометь" завершен`);
    return imbalanceResult;
  } catch (error) {
    console.error("❌ Критическая ошибка в анализе дисбаланса прав методом 'Извлеки-и-пометь':", error);
    return { 
      rightsImbalance: [
        {
          id: "error_fallback_1",
          type: "control_rights", 
          description: "Не удалось проанализировать дисбаланс прав из-за технической ошибки в методе 'Извлеки-и-пометь'",
          buyerRights: 0,
          supplierRights: 0,
          severity: "low",
          recommendation: "Необходимо провести ручной анализ распределения прав между сторонами"
        }
      ],
      overallConclusion: "Анализ дисбаланса прав методом 'Извлеки-и-пометь' не удался из-за технической ошибки. Рекомендуется ручная проверка ключевых условий договора."
    };
  }
}

// Улучшенная разбивка договора на смысловые блоки
function splitIntoSpans(text: string): Array<{ id: string; text: string }> {
  const lines = text.split(/\n/);
  const paragraphs: string[] = [];
  let currentParagraph = '';

  // Функция для определения начала новой секции
  const isNewSection = (line: string): boolean => {
    const trimmed = line.trim();
    // Номерованные пункты (1., 2.1., etc.)
    if (/^\d+\.(\d+\.)*\s/.test(trimmed)) return true;
    // Заголовки в верхнем регистре
    if (/^[А-ЯЁ\s]{3,}$/.test(trimmed) && trimmed.length < 100) return true;
    // Статьи договора
    if (/^(статья|раздел|глава|пункт)\s*\d+/i.test(trimmed)) return true;
    return false;
  };

  // Функция для определения важности абзаца
  const isImportantContent = (text: string): boolean => {
    const trimmed = text.trim();
    // Минимальная длина содержательного текста
    if (trimmed.length < CHUNKING_CONFIG.MIN_CONTENT_LENGTH) return false;
    // Исключаем заголовки и служебные строки
    if (/^[А-ЯЁ\s]{3,}$/.test(trimmed)) return false;
    // Исключаем строки только с номерами и датами
    if (/^[\d\s\.\-\/]+$/.test(trimmed)) return false;
    return true;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Пропускаем пустые строки
    if (trimmedLine === '') {
      if (currentParagraph.trim() && isImportantContent(currentParagraph)) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = '';
      }
      continue;
    }

    // Новая секция - сохраняем предыдущий абзац и начинаем новый
    if (isNewSection(trimmedLine)) {
      if (currentParagraph.trim() && isImportantContent(currentParagraph)) {
        paragraphs.push(currentParagraph.trim());
      }
      currentParagraph = trimmedLine;
    } else {
      // Продолжение текущего абзаца
      if (currentParagraph) {
        // Проверяем, нужен ли перенос строки или пробел
        const needsSpace = !currentParagraph.endsWith(' ') && 
                          !trimmedLine.startsWith('(') && 
                          !currentParagraph.endsWith('(');
        currentParagraph += (needsSpace ? ' ' : '') + trimmedLine;
      } else {
        currentParagraph = trimmedLine;
      }
    }

    // Автоматическая разбивка очень длинных абзацев
    if (currentParagraph.length > CHUNKING_CONFIG.MAX_PARAGRAPH_LENGTH) {
      // Ищем хорошее место для разделения (конец предложения)
      const sentences = currentParagraph.split(/[.!?]+/);
      if (sentences.length > 1) {
        const midPoint = Math.floor(sentences.length / 2);
        const firstPart = sentences.slice(0, midPoint).join('.') + '.';
        const secondPart = sentences.slice(midPoint).join('.').trim();
        
        if (firstPart.trim() && isImportantContent(firstPart)) {
          paragraphs.push(firstPart.trim());
        }
        currentParagraph = secondPart;
      }
    }
  }

  // Добавляем последний абзац
  if (currentParagraph.trim() && isImportantContent(currentParagraph)) {
    paragraphs.push(currentParagraph.trim());
  }

  // Фильтруем и нумеруем абзацы
  const filteredParagraphs = paragraphs
    .filter(p => isImportantContent(p))
    .map((paragraph, index) => ({
      id: `p${index + 1}`,
      text: paragraph,
    }));

  console.log(`📝 Договор разбит на ${filteredParagraphs.length} смысловых блоков`);
  
  return filteredParagraphs;
}

// Основная функция анализа
export async function analyzeContractWithGemini(
  contractText: string,
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier' = 'buyer',
  onProgress: (message: string) => void = () => {}
): Promise<{ contractParagraphs: ContractParagraph[], missingRequirements: ContractParagraph[], ambiguousConditions: ContractParagraph[], structuralAnalysis: any, contradictions: any[], rightsImbalance: any[], structuralDefects: any[] }> {
  console.log(`🚀 Начинаем многоэтапный анализ договора (${keyPool.getKeyCount()} API ключей)`);
  
  try {
    // Этап 1: Разбивка на абзацы и создание чанков
    onProgress("Этап 1/7: Подготовка данных и разбивка на чанки...");
    const paragraphs = splitIntoSpans(contractText);
    
    // Используем продвинутую разбивку на основе токенов с перекрытием
    const chunks = createChunksWithTokens(
      paragraphs,
      CHUNKING_CONFIG.MAX_TOKENS_PER_CHUNK,
      CHUNKING_CONFIG.OVERLAP_SENTENCES
    );
    
    console.log(`📄 Договор разбит на ${paragraphs.length} абзацев и ${chunks.length} чанков`);
    console.log(`📊 В среднем ${Math.round(paragraphs.length / chunks.length)} абзацев на чанк`);
    console.log(`🔑 Доступно API ключей: ${keyPool.getAvailableKeyCount()}/${keyPool.getKeyCount()}`);
    
    // Этап 2: Параллельный анализ чанков с контролируемым параллелизмом
    onProgress("Этап 2/7: Анализ содержимого договора...");
    const chunkResults = await processChunksInParallel(chunks, checklistText, riskText, perspective, onProgress);
    
    // Этап 3: Сбор найденных условий для поиска отсутствующих
    const foundConditions: string[] = [];
    const allAnalysis: any[] = [];
    
    chunkResults.forEach(chunkResult => {
      if (chunkResult.analysis) {
        // Проверяем и исправляем нарушения правил AI
        const cleanedAnalysis = chunkResult.analysis.map((item: any) => {
          // Если category: null, но есть комментарии - переклассифицируем как "ambiguous"
          if ((item.category === null || item.category === undefined) && 
              (item.comment || item.recommendation || item.improvedClause || item.legalRisk)) {
            console.warn(`⚠️ AI неправильно классифицировал: пункт ${item.id} имеет category: null, но содержит полезные комментарии. Переклассифицируем как "ambiguous".`);
            return {
              ...item,
              category: 'ambiguous' // Переклассифицируем как неоднозначные
            };
          }
          return item;
        });
        
        allAnalysis.push(...cleanedAnalysis);
        cleanedAnalysis.forEach((item: any) => {
          // Только полностью выполненные требования (checklist) считаем найденными
          // Частично выполненные (partial) НЕ считаем полностью найденными
          if (item.category === 'checklist') {
            foundConditions.push(`Выполнено: абзац ${item.id}`);
          }
        });
      }
    });
    
    // Этап 3: Поиск отсутствующих требований (надежный программный метод)
    onProgress("Этап 3/7: Поиск отсутствующих требований...");
    const missingResult = findMissingRequirementsReliable(allAnalysis, checklistText);
    console.log(`✅ ЭТАП 3 ЗАВЕРШЕН: Найдено ${missingResult.missingRequirements?.length || 0} отсутствующих требований`);
    
    // Этап 4: Поиск противоречий между пунктами
    onProgress("Этап 4/7: Поиск противоречий между пунктами...");
    console.log(`🔄 НАЧИНАЕМ ЭТАП 4: Поиск противоречий`);
    console.log(`📊 DEBUG ЭТАП 4: Подготовка к поиску противоречий (анализов: ${allAnalysis.length})`);
    
    let contradictionsResult;
    try {
      console.log(`📊 DEBUG ЭТАП 4: Вызываю findContradictions...`);
      contradictionsResult = await findContradictions(allAnalysis, paragraphs, perspective, onProgress);
      console.log(`📊 DEBUG ЭТАП 4: findContradictions завершена, результат:`, contradictionsResult);
      console.log(`✅ ЭТАП 4 ЗАВЕРШЕН: Найдено ${contradictionsResult.contradictions?.length || 0} противоречий`);
    } catch (error) {
      console.error("❌ ОШИБКА В ЭТАПЕ 4:", error);
      contradictionsResult = { contradictions: [] };
    }
    
    // Этап 5: Анализ дисбаланса прав между сторонами
    onProgress("Этап 5/7: Агрегация и анализ дисбаланса прав...");
    console.log(`🔄 НАЧИНАЕМ ЭТАП 5: Агрегация прав из ${chunkResults.length} чанков`);
    
    let rightsImbalanceResult;
    try {
      // Вызов новой функции агрегации, которая работает без AI
      rightsImbalanceResult = aggregateAndAnalyzeRights(chunkResults, paragraphs); // <-- Передаём paragraphs
      console.log(`✅ ЭТАП 5 ЗАВЕРШЕН: Найдено дисбалансов прав: ${rightsImbalanceResult.rightsImbalance?.length || 0}`);
    } catch (error) {
      console.error("❌ КРИТИЧЕСКАЯ ОШИБКА В ЭТАПЕ 5:", error);
      rightsImbalanceResult = { rightsImbalance: [], overallConclusion: "Ошибка при агрегации прав из чанков." };
    }
    
    // Этап 6: Поиск структурных дефектов и опечаток
    onProgress("Этап 6/8: Поиск структурных дефектов...");
    console.log(`🔄 НАЧИНАЕМ ЭТАП 6: Поиск структурных дефектов`);
    let structuralDefectsResult: any[] = [];
    try {
      structuralDefectsResult = await findStructuralDefects(paragraphs, perspective, onProgress);
      console.log(`✅ ЭТАП 6 ЗАВЕРШЕН: Найдено структурных дефектов: ${structuralDefectsResult.length}`);
    } catch (error) {
      console.error("❌ ОШИБКА В ЭТАПЕ 6:", error);
      structuralDefectsResult = [];
    }
    
    // Этап 7: Итоговый структурный анализ (с полным контекстом всех найденных проблем)
    onProgress("Этап 7/8: Формирование итогового структурного анализа...");
    console.log(`🔄 НАЧИНАЕМ ЭТАП 7: Итоговый структурный анализ`);
    const structuralResult = await performFinalStructuralAnalysis(
      allAnalysis, 
      missingResult.missingRequirements || [],
      contradictionsResult.contradictions || [],
      rightsImbalanceResult.rightsImbalance || [],
      perspective, 
      onProgress
    );
    console.log(`✅ ЭТАП 7 ЗАВЕРШЕН: Итоговый структурный анализ`);
    
    console.log(`🔄 ПЕРЕХОДИМ К ЭТАПУ 8: Финализация результатов`);
    
    // Этап 8: Финализация результатов
    onProgress("Этап 8/8: Финализация результатов...");
    
    const contractParagraphs: ContractParagraph[] = paragraphs.map(paragraph => {
      const analysis = allAnalysis.find((item: any) => item.id === paragraph.id);
      
      return {
        id: paragraph.id,
        text: paragraph.text, // Исходный текст абзаца
        category: analysis?.category || null,
        comment: analysis?.comment || null,
        recommendation: analysis?.recommendation || null,
        improvedClause: analysis?.improvedClause || null,
        legalRisk: analysis?.legalRisk || null,
        isExpanded: false,
      };
    });

    const missingRequirements: ContractParagraph[] = (missingResult.missingRequirements || []).map((req: any, index: number) => ({
      id: `missing_${index + 1}`,
      text: req.requirement || "Неопределенное требование",
      comment: req.comment || null,
      recommendation: req.recommendation || null,
      category: 'missing' as const,
    }));

    // Извлечение неоднозначных условий для отдельного массива
    const ambiguousConditions: ContractParagraph[] = contractParagraphs.filter(p => p.category === 'ambiguous');

    const finalStructuralAnalysis = structuralResult.structuralAnalysis || {
      overallAssessment: "Анализ выполнен",
      keyRisks: [],
      structureComments: "",
      legalCompliance: "",
      recommendations: []
    };

    // Статистика для отладки с новыми категориями
    const nullWithoutComments = contractParagraphs.filter(p => p.category === null && !p.comment && !p.recommendation).length;
    const nullWithComments = contractParagraphs.filter(p => p.category === null && (p.comment || p.recommendation)).length;
    
    const stats = {
      totalParagraphs: contractParagraphs.length,
      checklist: contractParagraphs.filter(p => p.category === 'checklist').length,
      partial: contractParagraphs.filter(p => p.category === 'partial').length,
      risk: contractParagraphs.filter(p => p.category === 'risk').length,
      ambiguous: ambiguousConditions.length,
      deemed_acceptance: contractParagraphs.filter(p => p.category === 'deemed_acceptance').length,
      external_refs: contractParagraphs.filter(p => p.category === 'external_refs').length,
      nullWithoutComments: nullWithoutComments,
      nullWithComments: nullWithComments, // Это должно быть 0
      missing: missingRequirements.length,
      contradictions: contradictionsResult.contradictions?.length || 0,
      rightsImbalance: rightsImbalanceResult.rightsImbalance?.length || 0,
    };

    console.log("📊 Финальная статистика:", stats);
    
    if (nullWithComments > 0) {
      console.warn(`⚠️ ВНИМАНИЕ: Найдено ${nullWithComments} пунктов с category: null, но с комментариями. Они были переклассифицированы как "ambiguous".`);
    }
    onProgress("Анализ завершен!");

    return {
      contractParagraphs,
      missingRequirements,
      ambiguousConditions,
      structuralAnalysis: finalStructuralAnalysis,
      contradictions: contradictionsResult.contradictions || [],
      rightsImbalance: rightsImbalanceResult.rightsImbalance || [],
      structuralDefects: structuralDefectsResult || []
    };
  } catch (error) {
    console.error("❌ Ошибка при анализе договора:", error);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage?.includes('Candidate was blocked')) {
      throw new Error('Запрос был заблокирован системой безопасности. Попробуйте изменить формулировку.');
    }
    
    if (errorMessage?.includes('Все API ключи исчерпали свои квоты')) {
      throw new Error('Все API ключи исчерпали свои квоты. Попробуйте позже или добавьте новые ключи.');
    }
    
    if (errorMessage?.includes('Resource has been exhausted')) {
      throw new Error('Превышен лимит запросов к Gemini API. Попробуйте позже или добавьте новые API ключи.');
    }
    
    if (errorMessage?.includes('не удалось распарсить') || errorMessage?.includes('Failed to parse')) {
      throw new Error('Не удалось распарсить ответ от Gemini. Проверьте корректность данных и попробуйте снова.');
    }
    
    throw new Error(`Ошибка при анализе договора: ${errorMessage}`);
  }
}