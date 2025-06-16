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
    model: MODEL_NAME,
    systemInstruction: `Ты - эксперт по анализу договоров поставки в России. Анализируй договоры с точки зрения ${perspective === 'buyer' ? 'Покупателя' : 'Поставщика'}.`
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

  const userPrompt = `Ты - AI-ассистент юриста, специализирующийся на анализе договоров поставки в соответствии с законодательством РФ.

❗ ПЕРВООЧЕРЕДНАЯ ЗАДАЧА: НАЙТИ НЕОДНОЗНАЧНЫЕ УСЛОВИЯ! ❗
В КАЖДОМ договоре есть неоднозначные формулировки!
ТЫ ОБЯЗАН найти минимум 5-10 неоднозначных условий и пометить их как category: "ambiguous"!

НЕОДНОЗНАЧНЫЕ УСЛОВИЯ - ОБЯЗАТЕЛЬНО ИЩИ:
• "своевременно", "незамедлительно" - БЕЗ конкретных сроков
• "по усмотрению", "по согласованию" - односторонние решения
• "в случае необходимости" - неопределенные условия  
• "разумные сроки", "должным образом" - без критериев
• "иные расходы", "дополнительные затраты" - открытые списки

ЭТАП 1: СТРУКТУРНЫЙ АНАЛИЗ ДОГОВОРА

Сначала изучи весь договор ЦЕЛИКОМ для понимания ключевых рисков с позиции ${perspectiveContext.role}.

ЭТАП 2: ДЕТАЛЬНЫЙ АНАЛИЗ ПО АБЗАЦАМ

Проанализируй каждый абзац с позиции ${perspectiveContext.role.toUpperCase()}.

ВАЖНО: Для пунктов, НЕ ОТНОСЯЩИХСЯ к чек-листу, рискам или неоднозначным условиям, указывай только:
- id, category: null, comment: null, recommendation: null, improvedClause: null, legalRisk: null

ПОЛНЫЙ анализ проводи ТОЛЬКО для пунктов:
1. Соответствующих требованиям из чек-листа (category: "checklist" или "partial")
2. Содержащих риски из списка рисков (category: "risk") 
3. Содержащих неоднозначные условия (category: "ambiguous") - ОБЯЗАТЕЛЬНО!
4. Отсутствующих в договоре, но требуемых (category: "missing")

Чек-лист ${perspectiveContext.requirements}:
${checklistText}

---
Список рисков для ${perspectiveContext.role}:
${riskText}

---
ПОЛНЫЙ ТЕКСТ ДОГОВОРА:
${contractText}

---
ДОГОВОР РАЗБИТЫЙ НА АБЗАЦЫ:
${JSON.stringify(paragraphs)}

---
КАТЕГОРИИ:
1. "checklist" - полностью соответствует требованиям чек-листа
2. "partial" - частично соответствует требованиям чек-листа, но не достигает их
3. "risk" - содержит условие из списка рисков
4. "ambiguous" - содержит неоднозначные условия (ОБЯЗАТЕЛЬНО НАЙТИ МИНИМУМ 5-10 ПРИМЕРОВ!)
5. null - для остальных абзацев

❗ КРАЙНЕ ВАЖНО ДЛЯ КАТЕГОРИИ "ambiguous" ❗
ОБЯЗАТЕЛЬНО найди и пометь следующие фразы из договора:
• "своевременной приемки" - категория: "ambiguous" (нет точного срока)
• "незамедлительно вызвать" - категория: "ambiguous" (неопределенное время)
• "по усмотрению Поставщика" - категория: "ambiguous" (односторонние решения)
• "в установленном порядке" - категория: "ambiguous" (порядок не определен)
• "иные расходы" - категория: "ambiguous" (открытый список)
• "в разумные сроки" - категория: "ambiguous" (субъективная оценка)

ШАБЛОН для category: "ambiguous":
{
  "id": X,
  "category": "ambiguous", 
  "comment": "Неоднозначная формулировка: [точное описание проблемы]",
  "recommendation": "Предложить конкретные сроки/критерии вместо расплывчатых формулировок"
}

ТРЕБУЕМЫЙ КОМПАКТНЫЙ JSON (БЕЗ ЛИШНИХ СЛОВ):
{
  "structuralAnalysis": {
    "overallAssessment": "Краткая оценка договора",
    "keyRisks": ["Риск 1", "Риск 2", "Риск 3"],
    "structureComments": "Краткие комментарии по структуре",
    "legalCompliance": "Краткая оценка соответствия закону",
    "recommendations": ["Рекомендация 1", "Рекомендация 2"]
  },
  "analysis": [
    {
      "id": "p1",
      "category": "checklist",
      "comment": "Краткая оценка",
      "recommendation": "Краткая рекомендация",
      "improvedClause": "Краткая улучшенная формулировка",
      "legalRisk": "Краткий правовой риск"
    },
    {
      "id": "p2",
      "category": "ambiguous",
      "comment": "Неоднозначная формулировка: конкретная проблема",
      "recommendation": "Конкретное предложение",
      "improvedClause": "Точная формулировка",
      "legalRisk": "Правовой риск"
    },
    {
      "id": "p3",
      "category": null,
      "comment": null,
      "recommendation": null,
      "improvedClause": null,
      "legalRisk": null
    }
  ],
  "missingRequirements": [
    {
      "requirement": "Название требования",
      "comment": "Краткое объяснение важности (1-2 предложения)"
    }
  ]
}

ВАЖНО: 
- Пиши КРАТКО, экономь токены
- АКТИВНО ищи неоднозначные условия в каждом абзаце договора!
- Для null категорий все поля должны быть null
- Детальный анализ ТОЛЬКО для релевантных категорий
- В missingRequirements: краткое название + краткое объяснение важности (1-2 предложения)`

  try {
    console.log("🚀 Sending request to Gemini API...");
    console.log("Model:", MODEL_NAME);
    console.log("Prompt length:", userPrompt.length);
    
    // Оценка токенов на стороне клиента
    const estimatedTokens = Math.ceil(userPrompt.length / 3.5);
    console.log("=== ОЦЕНКА ТОКЕНОВ (КЛИЕНТ) ===");
    console.log("📝 Длина промпта (символы):", userPrompt.length.toLocaleString());
    console.log("🔢 Оценка токенов (клиент):", estimatedTokens.toLocaleString());
    console.log("📊 Настроенный лимит выхода:", "8,192 токена (максимальный)");
    
    if (estimatedTokens > 900000) {
      console.warn("⚠️ ПРЕДУПРЕЖДЕНИЕ: Очень большой промпт, возможны проблемы");
    }
    
    const generationConfig = {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 8192,  // Максимальный лимит для Gemini 2.0 Flash
      topP: 0.95,
      topK: 64,
    };
    
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig,
    });

    console.log("📥 Received response from Gemini API");
    console.log("Response object:", result);
    console.log("Response candidates:", result.response?.candidates?.length || 0);
    
    // Детальная информация о токенах
    if (result.response?.usageMetadata) {
      const usage = result.response.usageMetadata;
      console.log("=== ИСПОЛЬЗОВАНИЕ ТОКЕНОВ ===");
      console.log("📊 Входные токены:", usage.promptTokenCount || "не указано");
      console.log("📊 Выходные токены:", usage.candidatesTokenCount || "не указано");
      console.log("📊 Всего токенов:", usage.totalTokenCount || "не указано");
      
      // Проверяем только лимит выходных токенов
      const outputLimit = 8192;    // Максимальный лимит для Gemini 2.0 Flash
      
      if (usage.candidatesTokenCount) {
        const outputUsage = (usage.candidatesTokenCount / outputLimit * 100).toFixed(1);
        console.log(`📈 Использование выходных токенов: ${outputUsage}% из ${outputLimit.toLocaleString()}`);
        
        if (usage.candidatesTokenCount >= outputLimit * 0.95) {
          console.warn("⚠️ КРИТИЧНО: Использовано >95% лимита выходных токенов!");
        } else if (usage.candidatesTokenCount >= outputLimit * 0.8) {
          console.warn("⚠️ ВНИМАНИЕ: Использовано >80% лимита выходных токенов!");
        }
      }
    } else {
      console.warn("⚠️ Метаданные использования токенов недоступны");
    }
    
    // Объявляем rawText заранее
    let rawText = '';
    
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
        if (generationConfig?.maxOutputTokens && generationConfig.maxOutputTokens > 5000) {
          console.log("🔄 Attempting fallback with reduced token limit...");
          const fallbackLimit = Math.floor(generationConfig.maxOutputTokens * 0.8);
          
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
    if (!rawText) {
      rawText = response.text();
    }
    
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
      text: req.requirement || "Неопределенное требование",
      comment: req.comment || null,
      recommendation: null,
      category: 'missing' as const,
    }));

    console.log("Final results:", {
      contractParagraphs: contractParagraphs.length,
      missingRequirements: missingRequirements.length,
      hasStructuralAnalysis: !!parsedResponse.structuralAnalysis
    });

    // Дополнительная статистика для отладки
    const categoryStats = {
      checklist: contractParagraphs.filter(p => p.category === 'checklist').length,
      partial: contractParagraphs.filter(p => p.category === 'partial').length,
      risk: contractParagraphs.filter(p => p.category === 'risk').length,
      ambiguous: contractParagraphs.filter(p => p.category === 'ambiguous').length,
      other: contractParagraphs.filter(p => p.category === 'other').length,
      null: contractParagraphs.filter(p => p.category === null).length,
    };
    
    console.log("=== СТАТИСТИКА КАТЕГОРИЙ ===");
    console.log("📊 Категории абзацев:", categoryStats);
    console.log("🟡 Неоднозначные условия найдены:", categoryStats.ambiguous > 0 ? "ДА" : "НЕТ");
    
    if (categoryStats.ambiguous > 0) {
      console.log("🟡 Список неоднозначных условий:");
      contractParagraphs
        .filter(p => p.category === 'ambiguous')
        .forEach((p, index) => {
          console.log(`   ${index + 1}. ${p.id}: ${p.text.substring(0, 100)}...`);
          console.log(`      Комментарий: ${p.comment}`);
        });
    } else {
      console.warn("⚠️ НЕОДНОЗНАЧНЫЕ УСЛОВИЯ НЕ НАЙДЕНЫ - проверьте примеры договора");
    }

    return {
      contractParagraphs,
      missingRequirements,
      ambiguousConditions: [], // Теперь неоднозначные условия обрабатываются в contractParagraphs
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
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (errorMessage?.includes('Candidate was blocked')) {
      throw new Error('Запрос был заблокирован системой безопасности. Попробуйте изменить формулировку.');
    }
    
    if (errorMessage?.includes('не удалось распарсить') || errorMessage?.includes('Failed to parse')) {
      throw new Error('Не удалось распарсить ответ от Gemini. Проверьте корректность данных и попробуйте снова.');
    }
    
    throw new Error(`Ошибка при анализе договора: ${errorMessage}`);
  }
}