const { createServer } = require("http");
const { Server } = require("socket.io");
const express = require('express');
const path = require('path');

const app = express();
const httpServer = createServer(app);

app.use(express.static(path.join(__dirname, '../Client/dist')));

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const allUsers = {};
const allRooms = {};

io.on("connection", (socket) => {
  allUsers[socket.id] = {
    socket: socket,
    online: true,
  };

  const getOpponent = (socketId) => {
    const currentUser = allUsers[socketId];
    if (!currentUser || !currentUser.room) return null;
    const r = allRooms[currentUser.room];
    if (r) {
      return r.player1 && r.player1.socket.id === socketId ? r.player2 : r.player1;
    }
    return null;
  };

  socket.on("playerMoveFromClient", (data) => {
    const opp = getOpponent(socket.id);
    if (opp) opp.socket.emit("playerMoveFromServer", { ...data });
  });

  socket.on("chat_message", (msg) => {
    const opp = getOpponent(socket.id);
    if (opp) opp.socket.emit("chat_message", msg);
  });

  socket.on("webrtc_signal", (data) => {
    const opp = getOpponent(socket.id);
    if (opp) opp.socket.emit("webrtc_signal", data);
  });

  socket.on("create_room", (data) => {
    const currentUser = allUsers[socket.id];
    currentUser.playerName = data.playerName;
    
    // Generate a random 4-digit room code
    const roomId = Math.floor(1000 + Math.random() * 9000).toString();
    
    allRooms[roomId] = {
      player1: currentUser,
      player2: null,
      roomId: roomId,
    };
    
    currentUser.room = roomId;
    socket.emit("room_created", { roomId });
  });

  socket.on("join_room", (data) => {
    const currentUser = allUsers[socket.id];
    currentUser.playerName = data.playerName;
    const roomId = data.roomId;
    
    const room = allRooms[roomId];

    if (room) {
      if (!room.player1) {
        room.player1 = currentUser;
      } else if (!room.player2) {
        room.player2 = currentUser;
      } else {
        socket.emit("room_join_error", { message: "Invalid Room ID or Room is full" });
        return;
      }

      currentUser.room = roomId;

      if (room.player1 && room.player2) {
        const opponentPlayer = room.player1.socket.id === socket.id ? room.player2 : room.player1;
        
        const isPlayer1First = Math.random() > 0.5;
        const player1Sign = isPlayer1First ? "circle" : "cross";
        const player2Sign = isPlayer1First ? "cross" : "circle";
        
        currentUser.socket.emit("OpponentFound", {
          opponentName: opponentPlayer.playerName,
          playingAs: room.player1.socket.id === socket.id ? player1Sign : player2Sign,
          isInitiator: false
        });

        opponentPlayer.socket.emit("OpponentFound", {
          opponentName: currentUser.playerName,
          playingAs: room.player1.socket.id === socket.id ? player2Sign : player1Sign,
          isInitiator: true
        });
      }
    } else {
      socket.emit("room_join_error", { message: "Invalid Room ID or Room is full" });
    }
  });

  socket.on("disconnect", function () {
    const currentUser = allUsers[socket.id];
    if (currentUser) {
      currentUser.online = false;
      
      if (currentUser.room) {
        const room = allRooms[currentUser.room];
        if (room) {
          if (room.player1 && room.player1.socket.id === socket.id) {
            if (room.player2) {
              room.player2.socket.emit("opponentLeftMatch");
            }
            room.player1 = null;
          } else if (room.player2 && room.player2.socket.id === socket.id) {
            if (room.player1) {
              room.player1.socket.emit("opponentLeftMatch");
            }
            room.player2 = null;
          }
          
          if (!room.player1 && !room.player2) {
            setTimeout(() => {
              const currentRoomState = allRooms[currentUser.room];
              if (currentRoomState && !currentRoomState.player1 && !currentRoomState.player2) {
                delete allRooms[currentUser.room];
              }
            }, 30000); 
          }
        }
      }
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../Client/dist/index.html'));
});

httpServer.listen(3000, () => {
  console.log('Server listening on port 3000');
});
