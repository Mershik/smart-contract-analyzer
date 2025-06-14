import { useState } from "react";
import { analyzeContractWithGemini } from "@/lib/gemini";
import type { ContractParagraph,  StructuralAnalysis} from "@shared/schema";

export function useGeminiAnalysis() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeContract = async (
    contractText: string,
    checklistText: string,
    riskText: string,
    perspective: 'buyer' | 'supplier' = 'buyer'
  ): Promise<{ 
    contractParagraphs: ContractParagraph[], 
    missingRequirements: ContractParagraph[], 
    ambiguousConditions: ContractParagraph[],
    structuralAnalysis: StructuralAnalysis
  }> => {
    setIsLoading(true);
    setError(null);

    try {
      const { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis } = await analyzeContractWithGemini(contractText, checklistText, riskText, perspective);
      
      // Сохраняем результат анализа на сервере
      try {
        await fetch('/api/analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contractText,
            analysisResult: { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis },
          }),
        });
      } catch (saveError) {
        console.warn('Failed to save analysis to server:', saveError);
        // Не прерываем выполнение, если сохранение не удалось
      }
      
      return { contractParagraphs, missingRequirements, ambiguousConditions, structuralAnalysis };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Analysis failed";
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    analyzeContract,
    isLoading,
    error,
  };
}
