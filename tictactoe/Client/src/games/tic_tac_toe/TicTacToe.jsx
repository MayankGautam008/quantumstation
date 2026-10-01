import React, { useState, useEffect, useMemo, useRef } from "react";
import "../../App.css"; // or we can create TicTacToe.css if needed
import Square from "../../Square/Square";
import { io } from "socket.io-client";
import Swal from "sweetalert2";
import Confetti from "react-confetti";

const getInitialGameState = () => [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
];

const TicTacToe = ({ onBack }) => {
  const [gameState, setGameState] = useState(getInitialGameState());
  const [currentPlayer, setCurrentPlayer] = useState("circle");
  const [finishedState, setFinishetState] = useState(false);
  const [finishedArrayState, setFinishedArrayState] = useState([]);
  const [playOnline, setPlayOnline] = useState(false);
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [opponentName, setOpponentName] = useState(null);
  const [playingAs, setPlayingAs] = useState(null);
  const [roomId, setRoomId] = useState("");

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const peerRef = useRef(null);
  const audioRef = useRef(null);
  const localStreamRef = useRef(null);
  const iceCandidateQueue = useRef([]);
  const [micActive, setMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const savedRoomId = sessionStorage.getItem("roomId");
    const savedPlayerName = sessionStorage.getItem("playerName");

    if (savedRoomId && savedPlayerName) {
      setPlayerName(savedPlayerName);
      
      const newSocket = io("/", {
        autoConnect: true,
      });

      newSocket.emit("join_room", {
        playerName: savedPlayerName,
        roomId: savedRoomId,
      });

      setSocket(newSocket);
    }
  }, []);

  const checkWinner = () => {
    // row dynamic
    for (let row = 0; row < gameState.length; row++) {
      if (
        gameState[row][0] === gameState[row][1] &&
        gameState[row][1] === gameState[row][2]
      ) {
        setFinishedArrayState([row * 3 + 0, row * 3 + 1, row * 3 + 2]);
        return gameState[row][0];
      }
    }

    // column dynamic
    for (let col = 0; col < gameState.length; col++) {
      if (
        gameState[0][col] === gameState[1][col] &&
        gameState[1][col] === gameState[2][col]
      ) {
        setFinishedArrayState([0 * 3 + col, 1 * 3 + col, 2 * 3 + col]);
        return gameState[0][col];
      }
    }

    if (
      gameState[0][0] === gameState[1][1] &&
      gameState[1][1] === gameState[2][2]
    ) {
      return gameState[0][0];
    }

    if (
      gameState[0][2] === gameState[1][1] &&
      gameState[1][1] === gameState[2][0]
    ) {
      return gameState[0][2];
    }

    const isDrawMatch = gameState.flat().every((e) => {
      if (e === "circle" || e === "cross") return true;
    });

    if (isDrawMatch) return "draw";

    return null;
  };

  useEffect(() => {
    const winner = checkWinner();
    if (winner) {
      setFinishetState(winner);
    }
  }, [gameState]);

  useEffect(() => {
    if (!socket) return;

    socket.off("opponentLeftMatch");
    socket.off("playerMoveFromServer");
    socket.off("connect");
    socket.off("room_created");
    socket.off("OpponentFound");
    socket.off("room_join_error");
    socket.off("webrtc_signal");
    socket.off("chat_message");
    socket.off("match_restarted");

    socket.on("match_restarted", (data) => {
      setGameState(getInitialGameState());
      setCurrentPlayer("circle");
      setFinishetState(false);
      setFinishedArrayState([]);
      if (data && data.playingAs) {
        setPlayingAs(data.playingAs);
      }
    });

    socket.on("opponentLeftMatch", () => {
      setFinishetState("opponentLeftMatch");
    });

    socket.on("playerMoveFromServer", (data) => {
      const id = data.state.id;
      setGameState((prevState) => {
        let newState = [...prevState];
        const rowIndex = Math.floor(id / 3);
        const colIndex = id % 3;
        newState[rowIndex][colIndex] = data.state.sign;
        return newState;
      });
      setCurrentPlayer(data.state.sign === "circle" ? "cross" : "circle");
    });

    socket.on("connect", function () {
      setPlayOnline(true);
    });

    socket.on("room_created", function (data) {
      setRoomId(data.roomId);
      sessionStorage.setItem("roomId", data.roomId);
    });

    socket.on("room_join_error", function (data) {
      Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: data.message,
      });
      setPlayOnline(false);
      socket.disconnect();
      sessionStorage.removeItem("roomId");
    });

    socket.on("OpponentFound", async function (data) {
      setPlayingAs(data.playingAs);
      setOpponentName(data.opponentName);

      try {
        iceCandidateQueue.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        setMicActive(true);

        const peer = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:global.stun.twilio.com:3478" }
          ]
        });
        peerRef.current = peer;

        stream.getTracks().forEach(track => peer.addTrack(track, stream));

        peer.ontrack = (event) => {
          if (audioRef.current) {
            audioRef.current.srcObject = event.streams[0];
          }
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("webrtc_signal", { type: "candidate", candidate: event.candidate });
          }
        };

        if (data.isInitiator) {
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket.emit("webrtc_signal", { type: "offer", offer });
        }
      } catch (err) {
        console.error("Mic access denied or error:", err);
        Swal.fire({
          icon: 'warning',
          title: 'Microphone Disabled',
          text: 'Voice chat will not work because microphone access was denied or not supported.',
        });
      }
    });

    socket.on("webrtc_signal", async (data) => {
      const peer = peerRef.current;
      if (!peer) return;

      try {
        if (data.type === "offer") {
          await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("webrtc_signal", { type: "answer", answer });

          while (iceCandidateQueue.current.length > 0) {
            await peer.addIceCandidate(iceCandidateQueue.current.shift());
          }
        } else if (data.type === "answer") {
          await peer.setRemoteDescription(new RTCSessionDescription(data.answer));

          while (iceCandidateQueue.current.length > 0) {
            await peer.addIceCandidate(iceCandidateQueue.current.shift());
          }
        } else if (data.type === "candidate") {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(new RTCIceCandidate(data.candidate));
          } else {
            iceCandidateQueue.current.push(new RTCIceCandidate(data.candidate));
          }
        }
      } catch (err) {
        console.error("WebRTC Error:", err);
      }
    });

    socket.on("chat_message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
       if (peerRef.current) peerRef.current.close();
       if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
       }
    };
  }, [socket]);

  const celebrationMessage = useMemo(() => {
    if (!finishedState || finishedState === "draw" || finishedState === "opponentLeftMatch") return "";

    const winMessages = [
      "Woohoo! You crushed it! 🏆",
      "Winner Winner Chicken Dinner! 🍗",
      "You're a Tic Tac Toe Legend! 👑",
      "Absolutely brilliant move! 🎉",
      "You completely destroyed them! 😂"
    ];

    const loseMessages = [
      "Oops! They outsmarted you this time! 😅",
      "They just stole your crown! 👑",
      "Better luck next time! 🍀",
      "They said: Easy Peasy Lemon Squeezy! 🍋",
      "Ouch, that was a tough loss! 💔"
    ];

    if (finishedState === playingAs) {
      return winMessages[Math.floor(Math.random() * winMessages.length)];
    } else {
      return loseMessages[Math.floor(Math.random() * loseMessages.length)];
    }
  }, [finishedState, playingAs]);

  const takePlayerName = async () => {
    const result = await Swal.fire({
      title: "Enter your name",
      input: "text",
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) {
          return "You need to write something!";
        }
      },
    });

    return result;
  };

  const takeRoomId = async () => {
    const result = await Swal.fire({
      title: "Enter Room ID",
      input: "text",
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value) {
          return "Please enter a Room ID!";
        }
      },
    });

    return result;
  };

  async function createRoomClick() {
    const result = await takePlayerName();

    if (!result.isConfirmed) {
      return;
    }

    const username = result.value;
    setPlayerName(username);
    sessionStorage.setItem("playerName", username);

    const newSocket = io("/", {
      autoConnect: true,
    });

    newSocket?.emit("create_room", {
      playerName: username,
    });

    setSocket(newSocket);
  }

  async function joinRoomClick() {
    const result = await takePlayerName();

    if (!result.isConfirmed) {
      return;
    }

    const username = result.value;
    setPlayerName(username);
    sessionStorage.setItem("playerName", username);

    const roomResult = await takeRoomId();
    if (!roomResult.isConfirmed) {
      return;
    }

    const roomCode = roomResult.value;
    sessionStorage.setItem("roomId", roomCode);

    const newSocket = io("/", {
      autoConnect: true,
    });

    newSocket?.emit("join_room", {
      playerName: username,
      roomId: roomCode,
    });

    setSocket(newSocket);
  }

  const sendChatMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const msg = { sender: "You", text: chatInput };
    setMessages((prev) => [...prev, msg]);
    socket.emit("chat_message", { sender: playerName, text: chatInput });
    setChatInput("");
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const handleExit = () => {
    if(socket) socket.disconnect();
    sessionStorage.removeItem("roomId");
    sessionStorage.removeItem("playerName");
    onBack();
  };

  const handleRestart = () => {
    socket.emit("restart_match");
  };

  if (!playOnline) {
    return (
      <div className="setup-container">
        <h1 className="landing-title">Zero - Kata</h1>
        <div className="setup-buttons">
          <button onClick={createRoomClick} className="btn-modern">
            Create Room
          </button>
          <button onClick={joinRoomClick} className="btn-modern">
            Join Room
          </button>
          <button onClick={onBack} className="btn-modern" style={{ borderColor: '#f0f', color: '#f0f' }}>
            Back to Platform
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-container">
      
      {/* Remote Audio */}
      <audio ref={audioRef} autoPlay />

      <div className="main-div">
        <button className="exit-btn" onClick={handleExit}>
          ← Exit Game
        </button>
        
        <div className="move-detection">
          <div
            className={`left ${
              currentPlayer === playingAs ? "current-move-" + currentPlayer : ""
            }`}
            style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          >
            {playerName} 
            {micActive && (
              <button 
                onClick={toggleMute} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? "🔇" : "🎙️"}
              </button>
            )}
          </div>
          <div
            className={`right ${
              currentPlayer !== playingAs ? "current-move-" + currentPlayer : ""
            }`}
          >
            {opponentName || "Waiting..."}
          </div>
        </div>
        <div>
          <h1 className="game-heading water-background">Tic Tac Toe</h1>
          {playOnline && !opponentName && roomId && (
            <h2 style={{ textAlign: 'center', marginBottom: '15px' }}>Room ID: {roomId}</h2>
          )}
          <div className="square-wrapper">
            {gameState.map((arr, rowIndex) =>
              arr.map((e, colIndex) => {
                return (
                  <Square
                    socket={socket}
                    playingAs={playingAs}
                    gameState={gameState}
                    finishedArrayState={finishedArrayState}
                    finishedState={finishedState}
                    currentPlayer={currentPlayer}
                    setCurrentPlayer={setCurrentPlayer}
                    setGameState={setGameState}
                    id={rowIndex * 3 + colIndex}
                    key={rowIndex * 3 + colIndex}
                    currentElement={e}
                  />
                );
              })
            )}
          </div>
          {finishedState &&
            finishedState !== "opponentLeftMatch" &&
            finishedState !== "draw" && (
              <>
                {finishedState === playingAs && (
                  <Confetti width={window.innerWidth} height={window.innerHeight} />
                )}
                <h3 className="finished-state">
                  {celebrationMessage}
                </h3>
                {finishedState === playingAs && (
                  <p style={{ marginTop: '15px', fontStyle: 'italic', fontSize: '14px', color: '#666', maxWidth: '400px', margin: '15px auto 0' }}>
                    Note: You have to be thankful to a legendary genius, Mayank, for making this game, and he's the reason behind your celebration here 😂😂
                  </p>
                )}
                <div style={{ marginTop: '30px', textAlign: 'center' }}>
                  <button onClick={handleRestart} className="btn-modern" style={{ fontSize: '1.2rem', padding: '10px 20px', background: '#0ff', color: '#000' }}>
                    🔄 Play Again
                  </button>
                </div>
              </>
            )}
          {finishedState &&
            finishedState !== "opponentLeftMatch" &&
            finishedState === "draw" && (
              <div style={{ textAlign: 'center' }}>
                <h3 className="finished-state">It's a Draw</h3>
                <div style={{ marginTop: '30px' }}>
                  <button onClick={handleRestart} className="btn-modern" style={{ fontSize: '1.2rem', padding: '10px 20px', background: '#0ff', color: '#000' }}>
                    🔄 Play Again
                  </button>
                </div>
              </div>
            )}
        </div>
        {!finishedState && opponentName && (
          <h2 className="opponent-status">You are playing against {opponentName}</h2>
        )}
        {finishedState && finishedState === "opponentLeftMatch" && (
          <h2 className="opponent-status">You won the match, Opponent has left</h2>
        )}
      </div>

      {/* Chat Section */}
      {opponentName && (
        <div className="chat-box">
          <div className="chat-header">
            Room Chat
          </div>
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-message ${m.sender === "You" ? 'sent' : 'received'}`}>
                <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>{m.sender}</div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={sendChatMessage} className="chat-form">
            <input 
              type="text" 
              value={chatInput} 
              onChange={(e) => setChatInput(e.target.value)} 
              placeholder="Type message..." 
              className="chat-input"
            />
            <button type="submit" className="chat-submit">Send</button>
          </form>
        </div>
      )}

    </div>
  );
};

export default TicTacToe;
