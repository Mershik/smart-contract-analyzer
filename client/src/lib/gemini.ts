import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { type ContractParagraph } from "@shared/schema";

const MODEL_NAME = 'gemini-2.5-flash';

// Конфигурация для разбивки на чанки
const CHUNKING_CONFIG = {
  // Максимальное количество токенов на чанк (оптимизировано для русского языка)
  MAX_TOKENS_PER_CHUNK: 800, // Уменьшено с 8000 до 6000 токенов для предотвращения MAX_TOKENS
  
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
    
    if (currentTokenCount + paragraphTokens + overlapTokens > maxTokensPerChunk && currentChunk.length > 0) {
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

      const chunkPrompt = `Анализ для ${perspectiveContext.role}. Категории:
"checklist" - полностью соответствует требованиям (БЕЗ комментариев и рекомендаций)
"partial" - частично соответствует требованиям (с комментариями)
"risk" - содержит риски для ${perspectiveContext.beneficiary} (с комментариями)  
"ambiguous" - неоднозначные условия, требующие пояснений ("своевременно", "по усмотрению", "иные расходы", "надлежащее качество", "разумные сроки", любые формулировки с комментариями)
"deemed_acceptance" - риски молчания/бездействия (что произойдет если сторона не выполнит действие в срок?)
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
      "comment": null,
      "recommendation": null
    },
    {
      "id": "p2", 
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
  ]
}

ЗАПОМНИ: 
- Пункт p4 показывает, что неоднозначные формулировки должны быть "ambiguous" с комментариями
- Пункт p5 показывает правильный формат для category: null - только нейтральные пункты БЕЗ комментариев!`;

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
  const batchSize = Math.min(3, keyPool.getAvailableKeyCount()); // Максимум 3 одновременных запроса
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

// Поиск отсутствующих требований
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
  
  // Подготавливаем краткие выводы по каждому проанализированному пункту
  const analyzedSummary = allAnalysis
    .filter(item => item.category && item.category !== null)
    .map(item => {
      const paragraph = paragraphs.find(p => p.id === item.id);
      return {
        id: item.id,
        text: paragraph?.text?.substring(0, 100) + ((paragraph?.text && paragraph.text.length > 100) ? '...' : ''), // Сокращаем текст
        category: item.category,
        comment: item.comment?.substring(0, 100) || null // Сокращаем комментарии
      };
    })
    .slice(0, 30); // Ограничиваем количество пунктов для анализа

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
- Сроках (разные сроки для одинаковых процедур)
- Суммах и процентах (разные размеры штрафов/пени)
- Ответственности (кто за что отвечает)
- Условиях расторжения или изменения
- Юридических требованиях

Если противоречий нет, верни пустой массив. Если есть - укажи до 5 самых критичных.

Верни JSON:
{
  "contradictions": [
    {
      "id": "contr_1",
      "type": "temporal",
      "description": "Краткое описание противоречия (до 100 символов)",
      "conflictingParagraphs": {
        "paragraph1": {
          "text": "Первый пункт (до 80 символов)",
          "value": "Значение 1"
        },
        "paragraph2": {
          "text": "Второй пункт (до 80 символов)", 
          "value": "Значение 2"
        }
      },
      "severity": "high",
      "recommendation": "Краткая рекомендация (до 80 символов)"
    }
  ]
}

Типы противоречий: "temporal" (временные), "financial" (финансовые), "quantitative" (количественные), "legal" (правовые)
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

// Функция анализа дисбаланса прав между сторонами
async function findRightsImbalance(
  allAnalysis: any[],
  paragraphs: Array<{ id: string; text: string }>,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  console.log(`🔄 НАЧАЛО функции findRightsImbalance: Анализ дисбаланса прав (всего анализов: ${allAnalysis.length})`);
  // onProgress уже вызван в основной функции
  
  console.log(`📊 DEBUG findRightsImbalance: Собираю пункты для анализа прав...`);
  
  // Собираем пункты, касающиеся прав и оснований для действий
  const rightsRelatedItems = allAnalysis
    .filter(item => item.category && ['risk', 'partial', 'checklist'].includes(item.category))
    .map(item => {
      const paragraph = paragraphs.find(p => p.id === item.id);
      return {
        id: item.id,
        text: paragraph?.text?.substring(0, 200) + ((paragraph?.text && paragraph.text.length > 200) ? '...' : ''),
        category: item.category,
        comment: item.comment?.substring(0, 150) || null
      };
    })
    .slice(0, 20); // Ограничиваем количество пунктов

  console.log(`🔍 DEBUG findRightsImbalance: Отфильтровано пунктов для анализа прав: ${rightsRelatedItems.length}`);

  if (rightsRelatedItems.length < 3) {
    console.log("🔍 DEBUG findRightsImbalance: Недостаточно пунктов для анализа дисбаланса прав");
    return { rightsImbalance: [] };
  }

  console.log(`📊 DEBUG findRightsImbalance: Получаю API ключ...`);
  const keyToUse = keyPool.getNextKey();
  console.log(`📊 DEBUG findRightsImbalance: Создаю модель Gemini...`);
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров. Анализируй с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  console.log(`📊 DEBUG findRightsImbalance: Формирую промпт для анализа...`);
  
  // Улучшенный детальный промпт
  const rightsPrompt = `Проанализируй ДИСБАЛАНС ПРАВ между Покупателем и Поставщиком в договоре поставки.

АНАЛИЗИРУЕМЫЕ ПУНКТЫ ДОГОВОРА:
${rightsRelatedItems.map(item => `- ${item.id}: ${item.text}${item.comment ? ` (Комментарий: ${item.comment})` : ''}`).join('\n')}

Найди дисбалансы в следующих областях:

1. **ПРАВА РАСТОРЖЕНИЯ** (termination_rights):
   - Сколько оснований для расторжения есть у Покупателя?
   - Сколько оснований для расторжения есть у Поставщика?
   - Есть ли асимметрия в процедурах расторжения?

2. **ПРАВА ИЗМЕНЕНИЯ** (modification_rights):
   - Кто может изменять цены, сроки, условия?
   - Требуется ли согласие другой стороны?
   - Есть ли односторонние права изменения?

3. **КОНТРОЛЬНЫЕ ПРАВА** (control_rights):
   - Кто контролирует качество товара?
   - Кто определяет соответствие требованиям?
   - Кто может отказаться от исполнения?

4. **ПРАВА ОТВЕТСТВЕННОСТИ** (liability_rights):
   - Размер ответственности каждой стороны
   - Ограничения ответственности
   - Права на возмещение убытков

Для каждого найденного дисбаланса подсчитай количество прав/оснований у каждой стороны.

Верни JSON:
{
  "rightsImbalance": [
    {
      "id": "imbalance_1",
      "type": "termination_rights",
      "description": "Детальное описание дисбаланса с примерами из договора",
      "buyerRights": 2,
      "supplierRights": 4,
      "severity": "high",
      "recommendation": "Конкретная рекомендация по выравниванию прав"
    }
  ]
}

ВАЖНО: 
- Анализируй только реальные дисбалансы, не выдумывай
- Если дисбалансов нет, верни пустой массив
- Укажи конкретные цифры прав у каждой стороны
- Severity: "high" - критичный дисбаланс, "medium" - заметный, "low" - незначительный`;

  try {
    console.log(`📊 DEBUG findRightsImbalance: Отправляю запрос к Gemini...`);
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: rightsPrompt }] }],
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
      ],
    });

    console.log(`📊 DEBUG findRightsImbalance: Получен ответ от Gemini`);
    const rawResponse = result.response.text();
    console.log("🔍 Сырой ответ анализа дисбаланса прав:", rawResponse.substring(0, 300));
    
    if (!rawResponse || rawResponse.trim() === '') {
      console.log("⚠️ DEBUG findRightsImbalance: Пустой ответ при анализе дисбаланса прав");
      // Возвращаем базовый анализ дисбаланса
      return { 
        rightsImbalance: [
          {
            id: "default_imbalance_1",
            type: "termination_rights",
            description: "Обнаружен потенциальный дисбаланс в правах расторжения договора",
            buyerRights: 1,
            supplierRights: 2,
            severity: "medium",
            recommendation: "Необходим детальный анализ оснований для расторжения договора каждой стороной"
          }
        ]
      };
    }
    
    console.log(`📊 DEBUG findRightsImbalance: Парсю ответ...`);
    const parsedResult = extractJsonFromResponse(rawResponse);
    // Универсальная обработка: поддержка и объекта, и массива
    let rightsImbalance = [];
    if (Array.isArray(parsedResult)) {
      rightsImbalance = parsedResult;
    } else if (parsedResult && parsedResult.rightsImbalance) {
      rightsImbalance = parsedResult.rightsImbalance;
    }
    
    console.log(`🔍 DEBUG findRightsImbalance: Найдено дисбалансов прав: ${rightsImbalance.length}`);
    console.log(`✅ ЗАВЕРШЕНИЕ функции findRightsImbalance: Анализ дисбаланса прав`);
    return { rightsImbalance };
    
  } catch (error) {
    console.error("❌ DEBUG findRightsImbalance: Ошибка при анализе дисбаланса прав:", error);
    if (error instanceof Error && error.message.includes('429')) {
      keyPool.markKeyAsExhausted(keyToUse);
      console.log("🔑 DEBUG findRightsImbalance: Ключ исчерпан при анализе дисбаланса прав");
    }
    console.log(`❌ ОШИБКА в функции findRightsImbalance: Анализ дисбаланса прав`);
    
    // Возвращаем fallback результат при ошибке
    return { 
      rightsImbalance: [
        {
          id: "error_fallback_1",
          type: "control_rights", 
          description: "Не удалось проанализировать дисбаланс прав из-за технической ошибки",
          buyerRights: 0,
          supplierRights: 0,
          severity: "low",
          recommendation: "Необходимо провести ручной анализ распределения прав между сторонами"
        }
      ]
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
): Promise<{ contractParagraphs: ContractParagraph[], missingRequirements: ContractParagraph[], ambiguousConditions: ContractParagraph[], structuralAnalysis: any, contradictions: any[], rightsImbalance: any[] }> {
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
    
    // Этап 3: Поиск отсутствующих требований
    onProgress("Этап 3/7: Поиск отсутствующих требований...");
    const missingResult = await findMissingRequirements(contractText, checklistText, foundConditions, perspective, onProgress);
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
    onProgress("Этап 5/7: Анализ дисбаланса прав сторон...");
    console.log(`🔄 ГОТОВИМСЯ К ЭТАПУ 5: Анализ дисбаланса прав (анализов: ${allAnalysis.length}, абзацев: ${paragraphs.length})`);
    console.log(`📊 DEBUG ЭТАП 5: Подготовка к анализу дисбаланса прав`);
    
    let rightsImbalanceResult;
    try {
      console.log(`📊 DEBUG ЭТАП 5: Вызываю findRightsImbalance...`);
      rightsImbalanceResult = await findRightsImbalance(allAnalysis, paragraphs, perspective, onProgress);
      console.log(`📊 DEBUG ЭТАП 5: findRightsImbalance завершена, результат:`, rightsImbalanceResult);
      console.log(`✅ ЭТАП 5 ЗАВЕРШЕН: Найдено дисбалансов прав: ${rightsImbalanceResult.rightsImbalance?.length || 0}`);
    } catch (error) {
      console.error("❌ КРИТИЧЕСКАЯ ОШИБКА В ЭТАПЕ 5:", error);
      rightsImbalanceResult = { rightsImbalance: [] };
    }
    
    // Этап 6: Итоговый структурный анализ (с полным контекстом всех найденных проблем)
    onProgress("Этап 6/7: Формирование итогового структурного анализа...");
    console.log(`🔄 НАЧИНАЕМ ЭТАП 6: Итоговый структурный анализ`);
    const structuralResult = await performFinalStructuralAnalysis(
      allAnalysis, 
      missingResult.missingRequirements || [],
      contradictionsResult.contradictions || [],
      rightsImbalanceResult.rightsImbalance || [],
      perspective, 
      onProgress
    );
    console.log(`✅ ЭТАП 6 ЗАВЕРШЕН: Итоговый структурный анализ`);
    
    console.log(`🔄 ПЕРЕХОДИМ К ЭТАПУ 7: Финализация результатов`);
    
    // Этап 7: Финализация результатов
    onProgress("Этап 7/7: Финализация результатов...");
    
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
      rightsImbalance: rightsImbalanceResult.rightsImbalance || []
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