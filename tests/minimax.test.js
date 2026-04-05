import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { chooseBestMove } from "../src/services/minimax.js";

test("minimax returns a deterministic move from the starting position", () => {
  const chessA = new Chess();
  const chessB = new Chess();

  const moveA = chooseBestMove(chessA, "white", 1);
  const moveB = chooseBestMove(chessB, "white", 1);

  assert.equal(moveA.san, moveB.san);
});

test("minimax finds a forced mate in one", () => {
  const chess = new Chess("6k1/5Q2/6K1/8/8/8/8/8 w - - 0 1");
  const move = chooseBestMove(chess, "white", 2);
  chess.move(move);

  assert.equal(chess.isCheckmate(), true);
});
