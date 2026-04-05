const PIECES = {
  wp: "♙",
  wn: "♘",
  wb: "♗",
  wr: "♖",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  bn: "♞",
  bb: "♝",
  br: "♜",
  bq: "♛",
  bk: "♚"
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const state = {
  sessionId: null,
  game: null,
  selectedSquare: null,
  previousFen: null
};

const boardEl = document.querySelector("#board");
const statusEl = document.querySelector("#status");
const historyEl = document.querySelector("#history");
const selectionEl = document.querySelector("#selection");
const agentAnswerEl = document.querySelector("#agent-answer");
const auditEl = document.querySelector("#audit");
const questionEl = document.querySelector("#question");
const playerColorEl = document.querySelector("#player-color");
const sideLabelsEl = document.querySelector("#side-labels");
const askAgentButtonEl = document.querySelector("#ask-agent");

function fenBoard(fen) {
  const [placement] = fen.split(" ");
  const rows = placement.split("/");
  const board = [];

  for (const row of rows) {
    const squares = [];
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i += 1) {
          squares.push(null);
        }
      } else {
        const color = char === char.toUpperCase() ? "w" : "b";
        squares.push(`${color}${char.toLowerCase()}`);
      }
    }
    board.push(squares);
  }

  return board;
}

function squareName(rowIndex, colIndex, playerColor) {
  const rank = playerColor === "white" ? 8 - rowIndex : rowIndex + 1;
  const fileIndex = playerColor === "white" ? colIndex : 7 - colIndex;
  return `${files[fileIndex]}${rank}`;
}

function renderBoard() {
  boardEl.innerHTML = "";
  if (!state.game) {
    return;
  }

  const board = fenBoard(state.game.fen);
  const playerColor = state.game.playerColor;
  const lastMove = state.game.lastMove;
  const lastMoveFrom = lastMove?.from ?? lastMove?.from_square ?? null;
  const lastMoveTo = lastMove?.to ?? lastMove?.to_square ?? null;

  if (state.previousFen && state.previousFen !== state.game.fen) {
    boardEl.classList.remove("board-updated");
    void boardEl.offsetWidth;
    boardEl.classList.add("board-updated");
  } else {
    boardEl.classList.remove("board-updated");
  }

  const rows = playerColor === "white" ? board : [...board].reverse();
  rows.forEach((row, rowIndex) => {
    const columns = playerColor === "white" ? row : [...row].reverse();
    columns.forEach((piece, colIndex) => {
      const square = squareName(rowIndex, colIndex, playerColor);
      const button = document.createElement("button");
      button.className = `square ${(rowIndex + colIndex) % 2 === 0 ? "light" : "dark"}`;
      button.dataset.square = square;
      button.textContent = piece ? PIECES[piece] : "";
      if (piece?.startsWith("w")) {
        button.classList.add("piece-white");
        button.setAttribute("aria-label", `White piece on ${square}`);
      } else if (piece?.startsWith("b")) {
        button.classList.add("piece-black");
        button.setAttribute("aria-label", `Black piece on ${square}`);
      } else {
        button.setAttribute("aria-label", `Empty square ${square}`);
      }
      if (state.selectedSquare === square) {
        button.classList.add("selected");
      }
      if (state.game.legalMoves.some((move) => move.from === state.selectedSquare && move.to === square)) {
        button.classList.add("target");
      }
      if (lastMoveFrom === square) {
        button.classList.add("last-from");
      }
      if (lastMoveTo === square) {
        button.classList.add("last-to");
      }
      button.addEventListener("click", () => handleSquareClick(square));
      boardEl.appendChild(button);
    });
  });

  state.previousFen = state.game.fen;
}

function formatMoveSquares(move) {
  const from = move?.from ?? move?.from_square ?? null;
  const to = move?.to ?? move?.to_square ?? null;
  return from && to ? ` (${from}-${to})` : "";
}

function formatAuditEvent(event) {
  const payload = event.payload ?? {};

  if (event.eventType === "move.human" || event.eventType === "move.ai") {
    const actor = event.eventType === "move.human" ? "Human" : "AI";
    const moveText = payload.from && payload.to ? `${payload.san} (${payload.from}-${payload.to})` : payload.san ?? "move";
    return `${actor}: ${moveText}`;
  }

  if (event.eventType === "agent.query") {
    return `Agent query: ${payload.question ?? "question"} | model ${payload.model ?? "unknown"} | ${payload.retrievalMode ?? "unknown"}`;
  }

  return `${event.eventType}`;
}

function renderAudit() {
  if (!state.game?.auditEvents?.length) {
    auditEl.textContent = "No audit events yet. Make a move or ask the agent.";
    return;
  }

  auditEl.textContent = state.game.auditEvents
    .map((event) => `${new Date(event.createdAt).toLocaleTimeString()} | ${formatAuditEvent(event)}`)
    .join("\n");
}

function appendInternetAnalysisSummary(result) {
  if (!result?.moveEffectiveness) {
    return;
  }

  const effectiveness = result.moveEffectiveness;
  const bestMove = result.internetAnalysis?.cloudEval?.bestMoveUci ?? "unknown";
  const actualMove = result.internetAnalysis?.playerMove?.uci ?? "unknown";
  const effectLine = `Move effectiveness: ${effectiveness.label}${effectiveness.score !== null ? ` (${effectiveness.score}/100)` : ""}`;
  const compareLine = `Compared online: played ${actualMove}, best internet line starts with ${bestMove}.`;
  auditEl.textContent = `${auditEl.textContent}\n\n${effectLine}\n${compareLine}`;
}

function renderGame() {
  if (!state.game) {
    statusEl.textContent = "Create a game to start.";
    historyEl.innerHTML = "";
    auditEl.textContent = "No audit events yet. Make a move or ask the agent.";
    renderBoard();
    return;
  }

  statusEl.textContent = `${state.game.turn} to move. Status: ${state.game.status}.`;
  sideLabelsEl.textContent = `You: ${capitalize(state.game.playerColor)}. AI: ${capitalize(state.game.aiColor)}.`;
  historyEl.innerHTML = "";
  state.game.history.forEach((move, index) => {
    const item = document.createElement("li");
    item.textContent = `${move.ply}. ${move.actor} ${move.san} (${move.from}-${move.to})`;
    if (index === state.game.history.length - 1) {
      item.classList.add("latest-move");
    }
    historyEl.appendChild(item);
  });
  renderAudit();
  renderBoard();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error || "Request failed.");
  }

  return body;
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

async function ensureSession() {
  if (state.sessionId) {
    return state.sessionId;
  }

  const session = await request("/api/sessions", { method: "POST" });
  state.sessionId = session.sessionId;
  return state.sessionId;
}

async function newGame() {
  await ensureSession();
  state.selectedSquare = null;
  state.game = await request("/api/games", {
    method: "POST",
    body: JSON.stringify({
      sessionId: state.sessionId,
      playerColor: playerColorEl.value
    })
  });
  selectionEl.textContent = "Select a piece, then a destination square.";
  agentAnswerEl.textContent = "No agent answer yet.";
  sideLabelsEl.textContent = `You: ${capitalize(state.game.playerColor)}. AI: ${capitalize(state.game.aiColor)}.`;
  renderGame();
}

async function handleSquareClick(square) {
  if (!state.game) {
    return;
  }

  if (!state.selectedSquare) {
    state.selectedSquare = square;
    selectionEl.textContent = `Selected ${square}.`;
    renderBoard();
    return;
  }

  if (state.selectedSquare === square) {
    state.selectedSquare = null;
    selectionEl.textContent = "Selection cleared.";
    renderBoard();
    return;
  }

  try {
    selectionEl.textContent = `You played ${state.selectedSquare} to ${square}. AI is thinking...`;
    const snapshot = await request(`/api/games/${state.game.gameId}/moves`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        from: state.selectedSquare,
        to: square
      })
    });
    state.game = snapshot;
    state.selectedSquare = null;
    if (snapshot.lastMove?.actor === "ai") {
      selectionEl.textContent = `AI replied with ${snapshot.lastMove.san}${formatMoveSquares(snapshot.lastMove)}.`;
    } else {
      selectionEl.textContent = `Move applied: ${snapshot.lastMove?.san ?? `${square}`}.`;
    }
    renderGame();
  } catch (error) {
    selectionEl.textContent = error.message;
    state.selectedSquare = null;
    renderBoard();
  }
}

async function askAgent() {
  if (!state.game) {
    agentAnswerEl.textContent = "Create a game first.";
    return;
  }

  const question = questionEl.value.trim();
  if (!question) {
    agentAnswerEl.textContent = "Enter a question.";
    return;
  }

  askAgentButtonEl.disabled = true;
  askAgentButtonEl.textContent = "Thinking...";
  agentAnswerEl.textContent = "Agent is thinking. The first response after startup can take up to a minute.";

  try {
    const result = await request(`/api/games/${state.game.gameId}/agent/query`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        question
      })
    });

    agentAnswerEl.textContent = result.answer;
    state.game = await request(`/api/games/${state.game.gameId}`);
    renderGame();
    auditEl.textContent = `${auditEl.textContent}\n\nAgent run ${result.agentRunId}\nCitations: ${result.citations
      .map((citation) => `[${citation.index}] ${citation.title}`)
      .join(", ")}`;
    appendInternetAnalysisSummary(result);
  } finally {
    askAgentButtonEl.disabled = false;
    askAgentButtonEl.textContent = "Ask agent";
  }
}

document.querySelector("#new-game").addEventListener("click", () => {
  newGame().catch((error) => {
    statusEl.textContent = error.message;
  });
});

askAgentButtonEl.addEventListener("click", () => {
  askAgent().catch((error) => {
    agentAnswerEl.textContent = error.message;
    askAgentButtonEl.disabled = false;
    askAgentButtonEl.textContent = "Ask agent";
  });
});

document.querySelector("#clear-selection").addEventListener("click", () => {
  state.selectedSquare = null;
  selectionEl.textContent = "Selection cleared.";
  renderBoard();
});
