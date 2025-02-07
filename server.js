const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://dasali-jenario.github.io", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: ["https://dasali-jenario.github.io", "http://localhost:3000"],
  credentials: true
}));
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

// Sample words for the game
const WORDS = [
  'cat', 'dog', 'house', 'tree', 'car', 'sun', 'moon', 'book',
  'computer', 'phone', 'pizza', 'beach', 'mountain', 'flower',
  'bird', 'fish', 'airplane', 'boat', 'train', 'bicycle'
];

// Game state
const rooms = new Map();

function getRandomWord() {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function getRoomsList() {
  const roomsList = [];
  rooms.forEach((value, roomId) => {
    roomsList.push({
      id: roomId,
      players: value.players.length,
      inProgress: value.isRoundInProgress
    });
  });
  return roomsList;
}

function nextTurn(room) {
  const roomData = rooms.get(room);
  if (!roomData || roomData.players.length === 0) return;

  // Move to next drawer
  let nextDrawerIndex = 0;
  if (roomData.currentDrawer) {
    const currentDrawerIndex = roomData.players.findIndex(p => p.id === roomData.currentDrawer.id);
    nextDrawerIndex = (currentDrawerIndex + 1) % roomData.players.length;
  }
  roomData.currentDrawer = roomData.players[nextDrawerIndex];
  roomData.word = getRandomWord();
  roomData.isRoundInProgress = true;

  // Notify all players about the new turn
  io.in(room).emit('turnStart', {
    drawer: roomData.currentDrawer,
    scores: roomData.scores
  });

  // Send the word only to the drawer
  io.to(roomData.currentDrawer.id).emit('wordAssigned', roomData.word);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  let currentRoom = null;

  // Get available rooms
  socket.on('getRooms', (callback) => {
    const rooms = getRoomsList();
    console.log('Sending rooms list:', rooms);
    callback(rooms);
  });

  // Create room
  socket.on('createRoom', ({ roomId, username }, callback) => {
    console.log(`Received create room request for ${roomId} by ${username}`);
    
    if (rooms.has(roomId)) {
      console.log(`Room ${roomId} already exists`);
      callback({ error: 'Room already exists' });
      return;
    }

    console.log(`Creating new room ${roomId}`);
    currentRoom = roomId;
    socket.join(roomId);
    
    const firstPlayer = { id: socket.id, username };
    const initialScores = { [socket.id]: 0 };
    
    rooms.set(roomId, {
      players: [firstPlayer],
      currentDrawer: firstPlayer,
      word: getRandomWord(),
      scores: initialScores,
      isRoundInProgress: true,
      creator: socket.id
    });

    const roomData = rooms.get(roomId);
    console.log(`Room ${roomId} created with data:`, roomData);

    // Send initial state to the creator
    socket.emit('turnStart', {
      drawer: firstPlayer,
      scores: initialScores
    });
    socket.emit('wordAssigned', roomData.word);

    // Send room joined event to creator
    socket.emit('playerJoined', {
      players: [firstPlayer],
      scores: initialScores,
      currentDrawer: firstPlayer
    });

    const response = { 
      success: true, 
      room: roomId,
      players: [firstPlayer],
      scores: initialScores,
      currentDrawer: firstPlayer
    };
    console.log(`Sending create room response:`, response);
    callback(response);

    io.emit('roomsUpdated', getRoomsList());
    console.log('Updated rooms list:', getRoomsList());
  });

  // Join room
  socket.on('joinRoom', ({ roomId, username }, callback) => {
    console.log(`Player ${username} joining room ${roomId}`);
    
    if (!rooms.has(roomId)) {
      console.log(`Room ${roomId} does not exist`);
      callback({ error: 'Room does not exist' });
      return;
    }

    const roomData = rooms.get(roomId);
    
    // Check if player is already in the room
    if (roomData.players.some(p => p.id === socket.id)) {
      console.log(`Player ${username} is already in room ${roomId}`);
      callback({ error: 'Already in room' });
      return;
    }

    currentRoom = roomId;
    socket.join(roomId);
    
    const newPlayer = { id: socket.id, username };
    roomData.players.push(newPlayer);
    roomData.scores[socket.id] = 0;
    
    // Send current room state to the new player
    socket.emit('playerJoined', {
      players: roomData.players,
      scores: roomData.scores,
      currentDrawer: roomData.currentDrawer
    });

    // If there's a current drawer, send them the word
    if (roomData.currentDrawer && roomData.currentDrawer.id === socket.id) {
      socket.emit('wordAssigned', roomData.word);
    }

    // Broadcast to other players in the room
    socket.to(roomId).emit('playerJoined', {
      players: roomData.players,
      scores: roomData.scores,
      currentDrawer: roomData.currentDrawer
    });

    callback({ 
      success: true, 
      room: roomId,
      players: roomData.players,
      scores: roomData.scores,
      currentDrawer: roomData.currentDrawer
    });
    
    // Update available rooms list for everyone
    io.emit('roomsUpdated', getRoomsList());

    // Log room state
    console.log(`Room ${roomId} players:`, roomData.players);
  });

  // Handle drawing
  socket.on('draw', ({ room, drawData }) => {
    const roomData = rooms.get(room);
    if (roomData && roomData.currentDrawer && roomData.currentDrawer.id === socket.id) {
      socket.to(room).emit('drawing', drawData);
    }
  });

  // Handle guess
  socket.on('guess', ({ room, guess }) => {
    const roomData = rooms.get(room);
    if (roomData && 
        roomData.word && 
        roomData.currentDrawer && 
        roomData.currentDrawer.id !== socket.id && // Drawer can't guess
        guess.toLowerCase() === roomData.word.toLowerCase()) {
      
      // Award points
      roomData.scores[socket.id] += 10; // Points for correct guess
      roomData.scores[roomData.currentDrawer.id] += 5; // Points for drawer

      // Notify everyone about the correct guess
      io.to(room).emit('correctGuess', {
        guesser: socket.id,
        scores: roomData.scores
      });

      // Start next turn
      setTimeout(() => nextTurn(room), 2000);
    }
  });

  // Handle clear canvas request
  socket.on('clearCanvas', ({ room }) => {
    const roomData = rooms.get(room);
    if (roomData && roomData.currentDrawer && roomData.currentDrawer.id === socket.id) {
      io.in(room).emit('canvasCleared');
    }
  });

  // Handle skip turn request
  socket.on('skipTurn', ({ room }) => {
    const roomData = rooms.get(room);
    if (roomData && roomData.currentDrawer && roomData.currentDrawer.id === socket.id) {
      nextTurn(room);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (currentRoom && rooms.has(currentRoom)) {
      const roomData = rooms.get(currentRoom);
      const playerIndex = roomData.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        roomData.players.splice(playerIndex, 1);
        delete roomData.scores[socket.id];
        
        // If the disconnected player was the drawer, move to next turn
        if (roomData.currentDrawer && roomData.currentDrawer.id === socket.id) {
          if (roomData.players.length > 0) {
            nextTurn(currentRoom);
          } else {
            roomData.currentDrawer = null;
            roomData.isRoundInProgress = false;
          }
        }

        // If room creator left and there are other players, assign new creator
        if (roomData.creator === socket.id && roomData.players.length > 0) {
          roomData.creator = roomData.players[0].id;
        }

        // Broadcast updated player list to remaining players
        io.to(currentRoom).emit('playerLeft', {
          players: roomData.players,
          scores: roomData.scores,
          disconnectedId: socket.id,
          currentDrawer: roomData.currentDrawer
        });

        // Only delete room if no players remain and it's been empty for a while
        if (roomData.players.length === 0) {
          setTimeout(() => {
            const currentRoomData = rooms.get(currentRoom);
            if (currentRoomData && currentRoomData.players.length === 0) {
              rooms.delete(currentRoom);
              console.log(`Room ${currentRoom} deleted - no players remaining`);
              io.emit('roomsUpdated', getRoomsList());
            }
          }, 5000); // Wait 5 seconds before deleting empty room
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';  // Listen on all network interfaces

server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('For local access, use: http://localhost:3001');
  console.log('For network access, use your computer\'s IP address');
}); 