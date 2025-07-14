import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { type ContractParagraph } from "@shared/schema";

const MODEL_NAME = 'gemini-2.5-flash';

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
    
    // Если JSON обрезан в середине строки, пытаемся закрыть её
    if (repairedJson.includes('"') && !repairedJson.endsWith('"')) {
      const lastQuoteIndex = repairedJson.lastIndexOf('"');
      const afterLastQuote = repairedJson.substring(lastQuoteIndex + 1);
      
      // Если после последней кавычки нет закрывающих символов, добавляем их
      if (!afterLastQuote.includes('"') && !afterLastQuote.includes('}')) {
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
      
      // Попытка найти хотя бы частичный валидный JSON
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
      console.warn("⚠️ Возвращаем пустой результат для данного чанка");
      return {
        chunkId: "failed",
        analysis: []
      };
    }
  }
}

// Создание больших чанков для максимального использования лимита 8000 токенов
function createChunks(paragraphs: Array<{ id: string; text: string }>, chunkSize: number = 15): Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }> {
  const chunks: Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }> = [];
  
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const chunkParagraphs = paragraphs.slice(i, i + chunkSize);
    chunks.push({
      id: `chunk_${Math.floor(i / chunkSize) + 1}`,
      paragraphs: chunkParagraphs
    });
  }
  
  console.log(`📦 Создано ${chunks.length} больших чанков по ${chunkSize} абзацев`);
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
"ambiguous" - неоднозначные условия ("своевременно", "по усмотрению", "иные расходы")
null - остальные пункты

ВАЖНО: Если обнаружишь противоречия в абзаце с другими частями договора (разные сроки, суммы, условия), обязательно укажи это в комментарии! Например: "ПРОТИВОРЕЧИЕ: Здесь указан срок 10 дней, но в п.5.2 указано 5 дней для того же процесса"

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
      "category": "risk",
      "comment": "Краткое описание риска",
      "recommendation": "Краткая рекомендация"
    }
  ]
}`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: chunkPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 8000, // Максимально используем лимит API
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
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`⚠️ ${chunk.id}: Нестандартное завершение - ${finishReason}`);
        
        if (finishReason === 'MAX_TOKENS') {
          console.warn(`⚠️ ${chunk.id}: Ответ обрезан из-за лимита токенов`);
        }
      }

      const rawResponse = result.response.text();
      console.log(`📝 Сырой ответ для ${chunk.id}:`, rawResponse.substring(0, 300));
      
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

// Пакетная обработка чанков по 4 за раз
async function processChunksSequentially(
  chunks: Array<{ id: string; paragraphs: Array<{ id: string; text: string }> }>,
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any[]> {
  const results: any[] = [];
  
  console.log(`📋 Начинаем последовательную обработку ${chunks.length} больших чанков`);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkNumber = i + 1;
    
    onProgress(`Анализ чанка ${chunkNumber} из ${chunks.length} (${chunk.paragraphs.length} абзацев)`);
    
    try {
      console.log(`🔍 Обрабатываем чанк ${chunkNumber}: ${chunk.paragraphs.length} абзацев`);
      const chunkResult: any = await analyzeChunk(chunk, checklistText, riskText, perspective);
      results.push(chunkResult);
      
      // Пауза между чанками для стабильности
      if (i < chunks.length - 1) {
        const availableKeys = keyPool.getAvailableKeyCount();
        const delay = availableKeys > 8 ? 1000 : availableKeys > 4 ? 2000 : 3000;
        console.log(`⏱️ Пауза ${delay}ms между чанками (доступно ключей: ${availableKeys})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      console.error(`❌ Ошибка в чанке ${chunkNumber}:`, error);
      throw error;
    }
  }
  
  return results;
}

// Сводный структурный анализ
async function performStructuralAnalysis(
  contractText: string,
  chunkResults: any[],
  perspective: 'buyer' | 'supplier',
  onProgress: (message: string) => void
): Promise<any> {
  onProgress("Выполняется структурный анализ договора...");
  
  const keyToUse = keyPool.getNextKey();
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  const structuralPrompt = `Сделай краткую сводку анализа договора для ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.

РЕЗУЛЬТАТЫ АНАЛИЗА АБЗАЦЕВ:
${JSON.stringify(chunkResults, null, 2)}

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
  onProgress("Поиск отсутствующих требований...");
  
  const keyToUse = keyPool.getNextKey();
  console.log(`🔑 Использую ключ ${keyToUse.substring(0, 10)}... (использован ${keyPool.getKeyUsageCount(keyToUse)} раз, доступно ${keyPool.getAvailableKeyCount()}/${keyPool.getKeyCount()})`);
  
  const genAI = new GoogleGenerativeAI(keyToUse);
  const model = genAI.getGenerativeModel({ 
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
  });

  const missingPrompt = `Найди 3-5 самых важных отсутствующих требований, сравнив чек-лист с выполненными условиями.

ПОЛНЫЙ ЧЕК-ЛИСТ:
${checklistText}

УЖЕ ПОЛНОСТЬЮ ВЫПОЛНЕННЫЕ УСЛОВИЯ (всего ${foundConditions.length}):
${foundConditions.join(', ')}

Верни JSON с 3-5 самыми важными отсутствующими требованиями:
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

// Основная функция анализа
export async function analyzeContractWithGemini(
  contractText: string,
  checklistText: string,
  riskText: string,
  perspective: 'buyer' | 'supplier' = 'buyer',
  onProgress: (message: string) => void = () => {}
): Promise<{ contractParagraphs: ContractParagraph[], missingRequirements: ContractParagraph[], ambiguousConditions: ContractParagraph[], structuralAnalysis: any, contradictions: any[] }> {
  console.log(`🚀 Начинаем многоэтапный анализ договора (${keyPool.getKeyCount()} API ключей)`);
  
  try {
    // Этап 1: Разбивка на абзацы и создание чанков
    onProgress("Подготовка данных...");
    const paragraphs = splitIntoSpans(contractText);
    const chunks = createChunks(paragraphs, 15); // Большие чанки для максимального использования API лимитов
    
    console.log(`📄 Договор разбит на ${paragraphs.length} абзацев и ${chunks.length} чанков`);
    console.log(`🔑 Доступно API ключей: ${keyPool.getAvailableKeyCount()}/${keyPool.getKeyCount()}`);
    
    // Этап 2: Последовательный анализ больших чанков
    const chunkResults = await processChunksSequentially(chunks, checklistText, riskText, perspective, onProgress);
    
    // Этап 3: Структурный анализ
    const structuralResult = await performStructuralAnalysis(contractText, chunkResults, perspective, onProgress);
    
    // Этап 4: Сбор найденных условий для поиска отсутствующих
    const foundConditions: string[] = [];
    const allAnalysis: any[] = [];
    
    chunkResults.forEach(chunkResult => {
      if (chunkResult.analysis) {
        allAnalysis.push(...chunkResult.analysis);
        chunkResult.analysis.forEach((item: any) => {
          // Только полностью выполненные требования (checklist) считаем найденными
          // Частично выполненные (partial) НЕ считаем полностью найденными
          if (item.category === 'checklist') {
            foundConditions.push(`Выполнено: абзац ${item.id}`);
          }
        });
      }
    });
    
    // Этап 5: Поиск отсутствующих требований
    const missingResult = await findMissingRequirements(contractText, checklistText, foundConditions, perspective, onProgress);
    
    // Этап 6: Слияние данных с исходными текстами
    onProgress("Финализация результатов...");
    
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

    // Статистика для отладки
    const stats = {
      totalParagraphs: contractParagraphs.length,
      checklist: contractParagraphs.filter(p => p.category === 'checklist').length,
      partial: contractParagraphs.filter(p => p.category === 'partial').length,
      risk: contractParagraphs.filter(p => p.category === 'risk').length,
      ambiguous: ambiguousConditions.length,
      missing: missingRequirements.length,
    };

    console.log("📊 Финальная статистика:", stats);
    onProgress("Анализ завершен!");

    return {
      contractParagraphs,
      missingRequirements,
      ambiguousConditions,
      structuralAnalysis: finalStructuralAnalysis,
      contradictions: []
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