import { users, type User, type InsertUser, type ContractAnalysis, type InsertContractAnalysis } from "@shared/schema";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createContractAnalysis(analysis: InsertContractAnalysis): Promise<ContractAnalysis>;
  getAnalysisByHash(hash: string): Promise<ContractAnalysis | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private analyses: Map<number, ContractAnalysis>;
  private analysesByHash: Map<string, ContractAnalysis>;
  currentId: number;
  currentAnalysisId: number;

  constructor() {
    this.users = new Map();
    this.analyses = new Map();
    this.analysesByHash = new Map();
    this.currentId = 1;
    this.currentAnalysisId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createContractAnalysis(insertAnalysis: InsertContractAnalysis): Promise<ContractAnalysis> {
    const id = this.currentAnalysisId++;
    const analysis: ContractAnalysis = { ...insertAnalysis, id };
    this.analyses.set(id, analysis);
    this.analysesByHash.set(analysis.contractHash, analysis);
    return analysis;
  }

  async getAnalysisByHash(hash: string): Promise<ContractAnalysis | undefined> {
    return this.analysesByHash.get(hash);
  }
}

export const storage = new MemStorage();
