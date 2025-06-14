import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContractAnalysisSchema } from "@shared/schema";
import crypto from "crypto";
import dotenv from "dotenv";

// Загружаем переменные окружения из .env файла
dotenv.config();

export async function registerRoutes(app: Express): Promise<Server> {
  // API endpoint для получения ключа API Gemini
  app.get("/api/gemini-key", (req, res) => {
    const apiKey = process.env.VITE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: "Gemini API key is not configured" });
    }
    res.json({ apiKey });
  });

  // Store contract analysis result
  app.post("/api/analysis", async (req, res) => {
    try {
      const { contractText, analysisResult } = req.body;
      
      if (!contractText || !analysisResult) {
        return res.status(400).json({ message: "Contract text and analysis result are required" });
      }

      // Создаем хеш для договора
      const contractHash = crypto.createHash('sha256').update(contractText).digest('hex');
      
      const analysisData = {
        contractHash,
        analysisResult,
        createdAt: new Date().toISOString(),
      };

      const validatedData = insertContractAnalysisSchema.parse(analysisData);
      const result = await storage.createContractAnalysis(validatedData);
      
      res.json({ success: true, id: result.id, hash: contractHash });
    } catch (error) {
      console.error("Error storing analysis:", error);
      res.status(500).json({ message: "Failed to store analysis" });
    }
  });

  // Get analysis by contract hash
  app.get("/api/analysis/:hash", async (req, res) => {
    try {
      const { hash } = req.params;
      
      if (!hash) {
        return res.status(400).json({ message: "Contract hash is required" });
      }

      const analysis = await storage.getAnalysisByHash(hash);
      
      if (!analysis) {
        return res.status(404).json({ message: "Analysis not found" });
      }

      res.json(analysis);
    } catch (error) {
      console.error("Error retrieving analysis:", error);
      res.status(500).json({ message: "Failed to retrieve analysis" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}