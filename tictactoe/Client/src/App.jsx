import React, { useState } from "react";
import "./App.css";
import TicTacToe from "./games/tic_tac_toe/TicTacToe";

const App = () => {
  const [selectedGame, setSelectedGame] = useState(() => sessionStorage.getItem("selectedGame") || null);

  const handleGameSelect = (game) => {
    setSelectedGame(game);
    sessionStorage.setItem("selectedGame", game);
  };

  const handleBack = () => {
    setSelectedGame(null);
    sessionStorage.removeItem("selectedGame");
  };

  if (selectedGame === "tictactoe") {
    return <TicTacToe onBack={handleBack} />;
  }

  return (
    <div className="landing-container">
      <div className="quantum-header">
        <h1 className="landing-title">QUANTUM STATION</h1>
        <p className="landing-subtitle">ENTER THE NEXUS</p>
      </div>
      <div className="games-grid">
        <div className="game-card" onClick={() => handleGameSelect("tictactoe")}>
          <div className="game-icon">❌⭕</div>
          <div className="game-name">Zero - Kata</div>
          <div className="game-desc">The Classic Tic Tac Toe Multiplayer</div>
        </div>
        <div className="game-card disabled-card">
          <div className="game-icon">🔒</div>
          <div className="game-name">Coming Soon</div>
          <div className="game-desc">More games warping in...</div>
        </div>
      </div>
    </div>
  );
};

export default App;
