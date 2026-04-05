import { Chess } from "chess.js";
import { config } from "../config.js";

function normalizeCentipawns(rawCp, playerColor) {
  if (typeof rawCp !== "number") {
    return null;
  }

  return playerColor === "white" ? rawCp : -rawCp;
}

function buildUci(move) {
  if (!move?.from || !move?.to) {
    return null;
  }

  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function parsePrincipalVariationMove(pv) {
  if (!pv?.moves) {
    return null;
  }

  return pv.moves.split(" ")[0] ?? null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function classifyMove(deltaCp) {
  if (deltaCp === null) {
    return {
      score: null,
      label: "unrated",
      summary: "No effectiveness score is available for this move."
    };
  }

  const centipawnLoss = Math.max(0, -deltaCp);
  const score = clamp(Math.round(100 - centipawnLoss / 3), 0, 100);

  if (centipawnLoss <= 20) {
    return {
      score,
      label: "excellent",
      summary: "The move is very close to best play."
    };
  }

  if (centipawnLoss <= 60) {
    return {
      score,
      label: "strong",
      summary: "The move is solid and only slightly behind the engine preference."
    };
  }

  if (centipawnLoss <= 120) {
    return {
      score,
      label: "playable",
      summary: "The move is reasonable but gives up some value versus the best line."
    };
  }

  if (centipawnLoss <= 220) {
    return {
      score,
      label: "dubious",
      summary: "The move falls noticeably short of the best continuation."
    };
  }

  return {
    score,
    label: "mistake",
    summary: "The move gives up a large amount of value versus the best continuation."
  };
}

function formatScore(cp) {
  if (typeof cp !== "number") {
    return "n/a";
  }

  return cp > 0 ? `+${cp}` : `${cp}`;
}

function recentMasterNames(mastersResponse) {
  const games = [...(mastersResponse.topGames ?? []), ...(mastersResponse.recentGames ?? [])];
  const names = new Set();

  for (const game of games) {
    if (game.white?.name) {
      names.add(game.white.name);
    }
    if (game.black?.name) {
      names.add(game.black.name);
    }
    if (names.size >= 4) {
      break;
    }
  }

  return [...names];
}

async function fetchJson(url, { headers = {}, timeoutMs = config.internetAnalysisTimeoutMs } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "saroir-byoa-chess-poc/0.1",
        ...headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function rebuildPosition(history, lastHumanMoveIndex) {
  const beforeChess = new Chess();

  for (let index = 0; index < lastHumanMoveIndex; index += 1) {
    const move = history[index];
    beforeChess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? undefined
    });
  }

  return beforeChess;
}

export class InternetChessService {
  async analyzeLastHumanMove(gameSnapshot) {
    const lastHumanMoveIndex = [...gameSnapshot.history]
      .map((move, index) => ({ move, index }))
      .filter(({ move }) => move.actor === "human")
      .at(-1)?.index;

    if (lastHumanMoveIndex === undefined) {
      return null;
    }

    const lastHumanMove = gameSnapshot.history[lastHumanMoveIndex];
    const beforeChess = rebuildPosition(gameSnapshot.history, lastHumanMoveIndex);
    const afterChess = new Chess(beforeChess.fen());
    afterChess.move({
      from: lastHumanMove.from,
      to: lastHumanMove.to,
      promotion: lastHumanMove.promotion ?? undefined
    });

    const previousEval = await this.fetchCloudEval(beforeChess.fen(), 4);
    const currentEval = await this.fetchCloudEval(afterChess.fen(), 1);
    const actualUci = buildUci(lastHumanMove);
    const matchingPv = previousEval?.pvs?.find((pv) => parsePrincipalVariationMove(pv) === actualUci) ?? null;
    const bestPv = previousEval?.pvs?.[0] ?? null;
    const bestMoveUci = parsePrincipalVariationMove(bestPv);
    const bestCp = normalizeCentipawns(bestPv?.cp ?? null, gameSnapshot.playerColor);
    const actualCp = normalizeCentipawns(matchingPv?.cp ?? currentEval?.pvs?.[0]?.cp ?? null, gameSnapshot.playerColor);
    const deltaCp = bestCp !== null && actualCp !== null ? actualCp - bestCp : null;
    const effectiveness = classifyMove(deltaCp);
    const masters = await this.fetchMastersBeforeMove(gameSnapshot.history, lastHumanMoveIndex);

    return {
      source: "internet",
      playerMove: {
        san: lastHumanMove.san,
        from: lastHumanMove.from,
        to: lastHumanMove.to,
        uci: actualUci,
        ply: lastHumanMove.ply
      },
      cloudEval: {
        source: "lichess-cloud-eval",
        bestMoveUci,
        bestScoreCp: bestCp,
        actualScoreCp: actualCp,
        deltaCp,
        effectiveness,
        principalVariation: bestPv?.moves ?? null
      },
      masters
    };
  }

  async fetchCloudEval(fen, multiPv) {
    const url = new URL("/api/cloud-eval", config.lichessBaseUrl);
    url.searchParams.set("fen", fen);
    url.searchParams.set("multiPv", String(multiPv));

    return fetchJson(url);
  }

  async fetchMastersBeforeMove(history, lastHumanMoveIndex) {
    if (!config.lichessApiToken) {
      return {
        source: "lichess-masters",
        available: false,
        reason: "LICHESS_API_TOKEN is not configured, so master-game comparison is disabled."
      };
    }

    const playedMoves = history.slice(0, lastHumanMoveIndex).map(buildUci).filter(Boolean);
    const url = new URL(config.lichessMastersUrl);
    if (playedMoves.length > 0) {
      url.searchParams.set("play", playedMoves.join(","));
    }

    try {
      const mastersResponse = await fetchJson(url, {
        headers: {
          Authorization: `Bearer ${config.lichessApiToken}`
        }
      });
      const totalGames =
        Number(mastersResponse.white ?? 0) + Number(mastersResponse.black ?? 0) + Number(mastersResponse.draws ?? 0);
      const topMoves = (mastersResponse.moves ?? []).slice(0, 3).map((move) => {
        const moveGames = Number(move.white ?? 0) + Number(move.black ?? 0) + Number(move.draws ?? 0);
        return {
          uci: move.uci,
          san: move.san,
          games: moveGames,
          sharePct: totalGames > 0 ? Math.round((moveGames / totalGames) * 1000) / 10 : null
        };
      });

      return {
        source: "lichess-masters",
        available: true,
        opening: mastersResponse.opening ?? null,
        totalGames,
        topMoves,
        comparedPlayers: recentMasterNames(mastersResponse)
      };
    } catch (error) {
      return {
        source: "lichess-masters",
        available: false,
        reason: `Master comparison request failed: ${error.message}`
      };
    }
  }

  buildCitation(moveAnalysis) {
    if (!moveAnalysis) {
      return null;
    }

    const lines = [
      `Last human move: ${moveAnalysis.playerMove.san} (${moveAnalysis.playerMove.from}-${moveAnalysis.playerMove.to}).`,
      `Internet engine source: ${moveAnalysis.cloudEval.source}.`,
      `Best move before that position: ${moveAnalysis.cloudEval.bestMoveUci ?? "unknown"} with score ${formatScore(moveAnalysis.cloudEval.bestScoreCp)} cp from the player's perspective.`,
      `Played move score: ${formatScore(moveAnalysis.cloudEval.actualScoreCp)} cp. Delta versus best: ${formatScore(moveAnalysis.cloudEval.deltaCp)} cp.`,
      `Effectiveness: ${moveAnalysis.cloudEval.effectiveness.label}${moveAnalysis.cloudEval.effectiveness.score !== null ? ` (${moveAnalysis.cloudEval.effectiveness.score}/100)` : ""}. ${moveAnalysis.cloudEval.effectiveness.summary}`
    ];

    if (moveAnalysis.masters?.available) {
      const openingLine = moveAnalysis.masters.opening
        ? `Master database opening: ${moveAnalysis.masters.opening.name} (${moveAnalysis.masters.opening.eco}).`
        : "Master database opening name unavailable.";
      const topMovesLine =
        moveAnalysis.masters.topMoves.length > 0
          ? `Top master moves from that position: ${moveAnalysis.masters.topMoves
              .map((move) => `${move.san} ${move.sharePct ?? "n/a"}%`)
              .join(", ")}.`
          : "No master move frequencies were returned for that position.";
      const playersLine =
        moveAnalysis.masters.comparedPlayers.length > 0
          ? `Representative master players in the returned sample: ${moveAnalysis.masters.comparedPlayers.join(", ")}.`
          : "No representative master names were returned in the response sample.";

      lines.push(openingLine, topMovesLine, playersLine);
    } else if (moveAnalysis.masters?.reason) {
      lines.push(`Master comparison unavailable: ${moveAnalysis.masters.reason}`);
    }

    return {
      id: `internet:${moveAnalysis.playerMove.ply}`,
      title: "Internet Move Analysis",
      content: lines.join(" "),
      source: "internet-chess-analysis",
      score: 0.95,
      metadata: {
        effectiveness: moveAnalysis.cloudEval.effectiveness,
        bestMoveUci: moveAnalysis.cloudEval.bestMoveUci,
        actualMoveUci: moveAnalysis.playerMove.uci
      }
    };
  }
}
