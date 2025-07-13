import { GoogleGenerativeAI } from "@google/generative-ai";
import { analysisResponseSchema, type ContractParagraph, type AnalysisResponse } from "@shared/schema";

let API_KEY = "";

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
): Promise<{ contractParagraphs: ContractParagraph[], missingRequirements: ContractParagraph[], ambiguousConditions: ContractParagraph[] }> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Gemini API key is not configured");
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const paragraphs = splitIntoSpans(contractText);

  // Формируем промпт в зависимости от перспективы
  const systemPrompt = perspective === 'buyer' 
    ? `Ты – AI-ассистент, специализирующийся на проверке договоров поставки СО СТОРОНЫ ПОКУПАТЕЛЯ. 
Твоя задача – защитить интересы Покупателя, проанализировать договор на соответствие его требованиям и выявить риски для Покупателя.

Верни ответ СТРОГО в JSON формате без дополнительного текста или markdown разметки.`
    : `Ты – AI-ассистент, специализирующийся на проверке договоров поставки СО СТОРОНЫ ПОСТАВЩИКА. 
Твоя задача – защитить интересы Поставщика, проанализировать договор на соответствие его потребностям и выявить риски для Поставщика.

Верни ответ СТРОГО в JSON формате без дополнительного текста или markdown разметки.`;

  const perspectiveContext = perspective === 'buyer'
    ? {
        role: 'Покупателя',
        requirements: 'требования Покупателя',
        risks: 'риски для Покупателя',
        attention: 'требуют внимания Покупателя',
        missing: 'отсутствующих требований Покупателя'
      }
    : {
        role: 'Поставщика', 
        requirements: 'требования Поставщика',
        risks: 'риски для Поставщика',
        attention: 'требуют внимания Поставщика',
        missing: 'отсутствующих требований Поставщика'
      };

  const userPrompt = `Проанализируй договор по ТРЕМ направлениям С ПОЗИЦИИ ${perspectiveContext.role.toUpperCase()}:

1. АНАЛИЗ АБЗАЦЕВ ДОГОВОРА - для каждого абзаца определи категорию и комментарий.
2. АНАЛИЗ ТРЕБОВАНИЙ ЧЕК-ЛИСТА - для каждого требования из чек-листа определи, выполнено ли оно в договоре.
3. ВЫЯВЛЕНИЕ НЕОДНОЗНАЧНЫХ УСЛОВИЙ - определи пункты договора, которые требуют дополнительного внимания.

Чек-лист ${perspectiveContext.requirements}:
${checklistText}

---
Список рисков для ${perspectiveContext.role}:
${riskText}

---
Договор (разбит на абзацы):
${JSON.stringify(paragraphs)}

---
Требуемый JSON-ответ:
{
  "analysis": [
    {"id": "p1", "status": "Соответствует", "category": "checklist", "comment": "Кратко почему соответствует требованию ${perspectiveContext.role}"},
    {"id": "p2", "status": "Найден риск", "category": "risk", "comment": "Кратко почему это риск для ${perspectiveContext.role}"},
    {"id": "p3", "status": "Обычное условие", "category": null, "comment": null}
  ],
  "missing_requirements": [
    {"requirement": "Пример отсутствующего требования", "comment": "Объяснение почему это важно для ${perspectiveContext.role}"}
  ],
  "ambiguous_conditions": [
    {"condition": "Пример неоднозначного условия", "paragraph_id": "p5", "comment": "Объяснение почему это условие неоднозначно и требует внимания"}
  ]
}

ПРАВИЛА КАТЕГОРИЗАЦИИ АБЗАЦЕВ С ПОЗИЦИИ ${perspectiveContext.role.toUpperCase()}:

1. "checklist" - если абзац содержит условие, которое ПРЯМО СООТВЕТСТВУЕТ какому-либо требованию из чек-листа ${perspectiveContext.role}

2. "risk" - если абзац содержит условие, которое ПРЯМО УПОМЯНУТО в списке ${perspectiveContext.risks}

3. null - для всех остальных абзацев (стандартные условия, обычные формулировки, технические детали)

Для missing_requirements укажи ТОЛЬКО те требования из чек-листа, которые ПОЛНОСТЬЮ ОТСУТСТВУЮТ в договоре.

Для ambiguous_conditions выяви пункты договора, которые ${perspectiveContext.attention}:
• Неоднозначные или нечеткие формулировки
• Условия, требующие дополнительного обсуждения или бизнес-решения
• Нестандартные условия, не покрытые чек-листом или списком рисков  
• Положения с непредвиденными юридическими/коммерческими последствиями для ${perspectiveContext.role}`;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);

    const responseText = response.response.text() || "";

    // Удаляем возможные markdown-ограждения
    const cleanedResponse = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsedResponse = JSON.parse(cleanedResponse);
    
    // Объединяем абзацы с результатами анализа
    const contractParagraphs: ContractParagraph[] = paragraphs.map((paragraph) => {
      const analysis = parsedResponse.analysis?.find((item: any) => item.id === paragraph.id);
      return {
        ...paragraph,
        category: analysis?.category,
        comment: analysis?.comment,
      };
    });

    // Формируем отсутствующие требования как отдельный массив
    const missingRequirements: ContractParagraph[] = [];
    if (parsedResponse.missing_requirements && Array.isArray(parsedResponse.missing_requirements)) {
      parsedResponse.missing_requirements.forEach((req: any, index: number) => {
        missingRequirements.push({
          id: `missing_${index + 1}`,
          text: req.requirement,
          category: 'missing',
          comment: req.comment,
        });
      });
    }

    // Формируем неоднозначные условия как отдельный массив
    const ambiguousConditions: ContractParagraph[] = [];
    if (parsedResponse.ambiguous_conditions && Array.isArray(parsedResponse.ambiguous_conditions)) {
      parsedResponse.ambiguous_conditions.forEach((condition: any, index: number) => {
        ambiguousConditions.push({
          id: `ambiguous_${index + 1}`,
          text: condition.condition,
          category: 'other',
          comment: condition.comment,
        });
      });
    }

    return { contractParagraphs, missingRequirements, ambiguousConditions };
  } catch (error) {
    console.error("Gemini API error:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to analyze contract: ${error.message}`);
    }
    throw new Error("Failed to analyze contract with Gemini API");
  }
}