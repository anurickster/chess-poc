import { config } from "../config.js";

export class AgentService {
  constructor({ repository, retrievalService, ollamaClient, internetChessService = null }) {
    this.repository = repository;
    this.retrievalService = retrievalService;
    this.ollamaClient = ollamaClient;
    this.internetChessService = internetChessService;
  }

  async answerQuestion({ sessionId, gameId, question, gameSnapshot }) {
    const { retrievalMode, citations, contextText } = await this.retrievalService.retrieve({
      question,
      gameSnapshot
    });
    const moveAnalysis = this.internetChessService
      ? await this.internetChessService.analyzeLastHumanMove(gameSnapshot).catch(() => null)
      : null;
    const internetCitation = this.internetChessService?.buildCitation(moveAnalysis) ?? null;
    const finalCitations = internetCitation ? [...citations, internetCitation] : citations;
    const finalContextText = internetCitation
      ? `${contextText}\n[${citations.length + 1}] ${internetCitation.title} (${internetCitation.source}): ${internetCitation.content}`
      : contextText;

    const system = [
      "You are the BYOA chess agent for a Saroir proof of concept.",
      "You explain the current chess game but you do not make moves.",
      "When internet-backed move analysis is available, explain whether the latest human move matches strong practice and how effective it was.",
      "Only claim a top-player or master comparison when the supplied context explicitly says master comparison is available.",
      "If the context says master comparison is unavailable, state that plainly and limit the analysis to the available engine or retrieval evidence.",
      "Answer using only the supplied context and cite sources by bracket number."
    ].join(" ");

    const prompt = [
      `Question: ${question}`,
      `Context:`,
      finalContextText,
      "If the context is insufficient, say what is missing."
    ].join("\n\n");

    let answer;

    try {
      answer = await this.ollamaClient.generate({ system, prompt });
    } catch {
      answer = "The agent is temporarily unavailable. Current game state and stored citations were logged, but no model answer could be generated.";
    }

    const agentRun = await this.repository.createAgentRun({
      sessionId,
      gameId,
      promptClass: "game-analysis",
      query: question,
      answer,
      model: config.ollamaChatModel,
      retrievalMode,
      citations: finalCitations.map((citation, index) => ({
        index: index + 1,
        id: citation.id,
        title: citation.title,
        source: citation.source
      }))
    });

    await this.repository.addAuditEvent({
      sessionId,
      gameId,
      agentRunId: agentRun.id,
      eventType: "agent.query",
      payload: {
        question,
        model: config.ollamaChatModel,
        retrievalMode,
        citationIds: finalCitations.map((citation) => citation.id),
        internetAnalysisEnabled: Boolean(internetCitation)
      }
    });

    return {
      answer,
      citations: finalCitations.map((citation, index) => ({
        index: index + 1,
        id: citation.id,
        title: citation.title,
        source: citation.source
      })),
      model: config.ollamaChatModel,
      retrievalMode,
      agentRunId: agentRun.id,
      moveEffectiveness: moveAnalysis?.cloudEval?.effectiveness ?? null,
      internetAnalysis: moveAnalysis
    };
  }
}
