# BYOA Chess Demo

This standalone demo is not a full platform implementation. It demonstrates a narrow version of the Bring Your Own Agent model.

The human player controls one side of a standard chess game. A deterministic minimax engine controls the other side.

The BYOA agent does not make chess moves. It reads the current game state, move history, and approved reference documents, then answers questions with citations.

Every agent answer is logged with the active model, the retrieval sources, and the linked game session.
