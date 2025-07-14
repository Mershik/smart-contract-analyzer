import { pgTable, text, serial, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const contractAnalyses = pgTable("contract_analyses", {
  id: serial("id").primaryKey(),
  contractHash: text("contract_hash").notNull(),
  analysisResult: jsonb("analysis_result").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertContractAnalysisSchema = createInsertSchema(contractAnalyses).pick({
  contractHash: true,
  analysisResult: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type ContractAnalysis = typeof contractAnalyses.$inferSelect;
export type InsertContractAnalysis = z.infer<typeof insertContractAnalysisSchema>;

// Analysis types
export const analysisItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  category: z.enum(['checklist', 'risk', 'missing', 'other', 'partial', 'ambiguous', 'contradiction']),
  comment: z.string(),
});

export const analysisResponseSchema = z.object({
  analysis: z.array(analysisItemSchema),
});

export type AnalysisItem = z.infer<typeof analysisItemSchema>;
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

export interface ContractParagraph {
  id: string;
  text: string;
  category?: 'checklist' | 'risk' | 'missing' | 'other' | 'partial' | 'ambiguous' | 'contradiction';
  comment?: string;
  recommendation?: string;
  improvedClause?: string;
  legalRisk?: string;
  isExpanded?: boolean;
}

// Новый тип для противоречий
export interface Contradiction {
  id: string;
  type: 'temporal' | 'financial' | 'quantitative' | 'legal';
  description: string;
  conflictingParagraphs: {
    paragraph1: {
      text: string;
      value: string;
    };
    paragraph2: {
      text: string;
      value: string;
    };
  };
  severity: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface StructuralAnalysis {
  overallAssessment: string;
  keyRisks: string[];
  ambiguousConditions?: string[];
  structureComments: string;
  legalCompliance: string;
  recommendations: string[];
}
