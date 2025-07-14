import { useState } from "react";
import { analyzeContractWithGemini } from "@/lib/gemini";
import type { ContractParagraph,  StructuralAnalysis, Contradiction} from "@shared/schema";

export function useGeminiAnalysis() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");

  const analyzeContract = async (
    contractText: string,
    checklistText: string,
    riskText: string,
    perspective: 'buyer' | 'supplier' = 'buyer',
    onProgress?: (_message: string) => void
  ): Promise<{ 
    contractParagraphs: ContractParagraph[], 
    missingRequirements: ContractParagraph[], 
    ambiguousConditions: ContractParagraph[],
    structuralAnalysis: StructuralAnalysis,
    contradictions: Contradiction[]
  }> => {
    setIsLoading(true);
    setError(null);
    setProgress("");

    // Внутренняя функция для обработки прогресса
    const handleProgress = (message: string) => {
      setProgress(message);
      if (onProgress) {
        onProgress(message);
      }
    };

    try {
      const { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis, contradictions } = await analyzeContractWithGemini(
        contractText, 
        checklistText, 
        riskText, 
        perspective,
        handleProgress // Передаем колбэк для индикатора прогресса
      );
      
      // Сохраняем результат анализа на сервере
      try {
        await fetch('/api/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contractText,
            analysisResult: { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis, contradictions },
          }),
        });
      } catch (saveError) {
        console.warn('Failed to save analysis to server:', saveError);
        // Не прерываем выполнение, если сохранение не удалось
      }
      
      return { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis, contradictions };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Analysis failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
      setProgress("");
    }
  };

  return {
    analyzeContract,
    isLoading,
    error,
    progress,
  };
}
