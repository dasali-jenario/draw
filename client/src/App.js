import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';
import { SERVER_URL } from './config';

const COLORS = [
  '#000000', // Black
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFA500', // Orange
  '#800080', // Purple
  '#FFC0CB', // Pink
  '#8B4513', // Brown
];

const BRUSH_SIZES = [
  { name: 'Small', size: 3 },
  { name: 'Medium', size: 5 },
  { name: 'Large', size: 8 },
  { name: 'Extra Large', size: 12 },
];

// Simplified socket configuration
const socket = io(SERVER_URL, {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  timeout: 10000,
});

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [players, setPlayers] = useState([]);
  const [currentDrawer, setCurrentDrawer] = useState(null);
  const [currentWord, setCurrentWord] = useState('');
  const [guess, setGuess] = useState('');
  const [scores, setScores] = useState({});
  const [messages, setMessages] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomId, setNewRoomId] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [error, setError] = useState('');
  
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [context, setContext] = useState(null);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);

  const isDrawer = currentDrawer?.id === socket.id;

  const draw = React.useCallback((drawData) => {
    if (!context) return;
    
    if (drawData.drawing) {
      context.beginPath();
      context.moveTo(drawData.x, drawData.y);
    } else {
      context.lineTo(drawData.x, drawData.y);
      context.strokeStyle = drawData.isEraser ? '#FFFFFF' : drawData.color;
      context.lineWidth = drawData.size;
      context.stroke();
    }
  }, [context]);

  useEffect(() => {
    const connectSocket = () => {
      console.log('Attempting to connect to server...');
      socket.connect();
    };

    connectSocket();

    socket.on('connect', () => {
      console.log('Connected to server with ID:', socket.id);
      setIsConnected(true);
      setError('');
      socket.emit('getRooms', (rooms) => {
        console.log('Available rooms:', rooms);
        setAvailableRooms(rooms);
      });
    });
    
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError('Failed to connect to server. Retrying...');
      setIsConnected(false);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
      setError('Disconnected from server. Attempting to reconnect...');
    });

    socket.on('roomsUpdated', (rooms) => {
      console.log('Rooms updated:', rooms);
      setAvailableRooms(rooms);
    });

    socket.on('playerJoined', ({ players, scores, currentDrawer }) => {
      console.log('Player joined event:', { players, scores, currentDrawer });
      setPlayers(players);
      setScores(scores);
      setCurrentDrawer(currentDrawer);
      const lastPlayer = players[players.length - 1];
      if (lastPlayer && lastPlayer.id !== socket.id) {
        setMessages(prev => [...prev, `${lastPlayer.username} joined the room`]);
      }
    });

    socket.on('playerLeft', ({ players, scores, disconnectedId, currentDrawer }) => {
      console.log('Player left:', disconnectedId);
      const leftPlayer = players.find(p => p.id === disconnectedId);
      setPlayers(players);
      setScores(scores);
      setCurrentDrawer(currentDrawer);
      if (leftPlayer) {
        setMessages(prev => [...prev, `${leftPlayer.username} left the room`]);
      }
    });

    socket.on('turnStart', ({ drawer, scores }) => {
      console.log('Turn start:', { drawer, scores });
      setCurrentDrawer(drawer);
      setScores(scores);
      if (context) {
        context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      setMessages(prev => [...prev, `${drawer.username}'s turn to draw`]);
    });

    socket.on('wordAssigned', (word) => {
      console.log('Word assigned:', word);
      setCurrentWord(word);
      setMessages(prev => [...prev, 'You are drawing: ' + word]);
    });

    socket.on('drawing', drawData => {
      console.log('Drawing data received:', drawData);
      if (!isDrawer) {
        draw(drawData);
      }
    });

    socket.on('correctGuess', ({ guesser, scores }) => {
      setScores(scores);
      const guessingPlayer = players.find(p => p.id === guesser);
      if (guessingPlayer) {
        setMessages(prev => [...prev, `${guessingPlayer.username} guessed correctly!`]);
      }
    });

    socket.on('canvasCleared', () => {
      if (context) {
        context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('disconnect');
      socket.off('roomsUpdated');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('turnStart');
      socket.off('wordAssigned');
      socket.off('drawing');
      socket.off('correctGuess');
      socket.off('canvasCleared');
      socket.close();
    };
  }, [context, draw, isDrawer, players]);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      setContext(ctx);
    }
  }, []);

  const createRoom = () => {
    if (!username || !newRoomId) {
      setError('Please enter both username and room ID');
      return;
    }

    console.log('Attempting to create room with:', { roomId: newRoomId, username });
    console.log('Socket connected:', socket.connected);
    
    socket.emit('createRoom', { roomId: newRoomId, username }, (response) => {
      console.log('Create room response received:', response);
      
      if (response.error) {
        console.error('Room creation error:', response.error);
        setError(response.error);
      } else if (response.success) {
        console.log('Room created successfully:', response);
        setCurrentRoom(response.room);
        setIsInRoom(true);
        setPlayers(response.players);
        setScores(response.scores);
        setCurrentDrawer(response.currentDrawer);
        setError('');
      } else {
        console.error('Unknown error in room creation');
        setError('Unknown error occurred');
      }
    });
  };

  const joinRoom = (roomId) => {
    if (!username) {
      setError('Please enter a username');
      return;
    }

    console.log('Joining room:', { roomId, username });
    
    socket.emit('joinRoom', { roomId, username }, (response) => {
      console.log('Join room response:', response);
      
      if (response.error) {
        setError(response.error);
      } else if (response.success) {
        setCurrentRoom(response.room);
        setIsInRoom(true);
        setPlayers(response.players);
        setScores(response.scores);
        setCurrentDrawer(response.currentDrawer);
        setError('');
        console.log('Successfully joined room:', response.room);
      } else {
        setError('Unknown error occurred');
      }
    });
  };

  const startDrawing = (e) => {
    if (!context || !isDrawer) return;
    
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = isEraser ? '#FFFFFF' : currentColor;
    context.lineWidth = brushSize;
    
    // Emit the initial point
    socket.emit('draw', {
      room: currentRoom,
      drawData: {
        x,
        y,
        drawing: true,
        color: isEraser ? '#FFFFFF' : currentColor,
        size: brushSize,
        isEraser
      }
    });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !context || !isDrawer) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    socket.emit('draw', {
      room: currentRoom,
      drawData: {
        x,
        y,
        drawing: false,
        color: currentColor,
        size: brushSize,
        isEraser
      }
    });
    
    draw({
      x,
      y,
      drawing: false,
      color: isEraser ? '#FFFFFF' : currentColor,
      size: brushSize,
      isEraser
    });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (context) {
      context.closePath();
    }
  };

  const handleGuess = (e) => {
    e.preventDefault();
    if (guess.trim() && !isDrawer) {
      socket.emit('guess', { room: currentRoom, guess });
      setGuess('');
    }
  };

  const clearCanvas = () => {
    if (context && isDrawer) {
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      socket.emit('clearCanvas', { room: currentRoom });
    }
  };

  const skipTurn = () => {
    if (isDrawer) {
      socket.emit('skipTurn', { room: currentRoom });
    }
  };

  const refreshRooms = () => {
    if (isConnected) {
      socket.emit('getRooms', (rooms) => {
        console.log('Refreshing rooms:', rooms);
        setAvailableRooms(rooms);
      });
    }
  };

  if (!isInRoom) {
    return (
      <div className="join-room">
        <h1>Pictionary</h1>
        {!isConnected ? (
          <div className="connection-status">
            <div className="spinner"></div>
            <p>Connecting to server...</p>
            {error && <div className="error-message">{error}</div>}
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            
            {error && <div className="error-message">{error}</div>}

            {showCreateRoom ? (
              <div className="create-room">
                <input
                  type="text"
                  placeholder="Enter room ID"
                  value={newRoomId}
                  onChange={(e) => setNewRoomId(e.target.value)}
                />
                <button 
                  onClick={createRoom}
                  disabled={!username || !newRoomId}
                >
                  Create Room
                </button>
                <button onClick={() => {
                  setShowCreateRoom(false);
                  setError('');
                }}>
                  Back
                </button>
              </div>
            ) : (
              <div className="room-list">
                <div className="room-controls">
                  <button onClick={() => {
                    setShowCreateRoom(true);
                    setError('');
                  }}>
                    Create New Room
                  </button>
                  <button onClick={refreshRooms}>
                    Refresh Rooms
                  </button>
                </div>
                <h3>Available Rooms:</h3>
                <div className="rooms">
                  {availableRooms.map((room) => (
                    <div key={room.id} className="room-item">
                      <span>Room: {room.id} ({room.players} players)</span>
                      <button 
                        onClick={() => joinRoom(room.id)}
                        disabled={!username}
                      >
                        Join
                      </button>
                    </div>
                  ))}
                  {availableRooms.length === 0 && (
                    <div className="no-rooms">
                      No rooms available. Create one!
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-info">
        <h2>Room: {currentRoom}</h2>
        <div className="players">
          <h3>Players:</h3>
          {players.map((player) => (
            <div 
              key={player.id} 
              className={`${player.id === socket.id ? 'current-player' : ''} ${player.id === currentDrawer?.id ? 'drawer' : ''}`}
            >
              {player.username}: {scores[player.id] || 0}
              {player.id === socket.id ? ' (You)' : ''}
              {player.id === currentDrawer?.id ? ' (Drawing)' : ''}
            </div>
          ))}
        </div>
        <div className="messages">
          <h3>Messages:</h3>
          {messages.map((message, index) => (
            <div key={index} className="message">
              {message}
            </div>
          ))}
        </div>
      </div>
      
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          style={{ cursor: isDrawer ? 'crosshair' : 'default', backgroundColor: 'white' }}
        />
        {isDrawer && (
          <div className="drawing-controls">
            <div className="color-picker">
              {COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-button ${color === currentColor ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => {
                    setCurrentColor(color);
                    setIsEraser(false);
                  }}
                />
              ))}
            </div>
            <div className="brush-controls">
              {BRUSH_SIZES.map((brush) => (
                <button
                  key={brush.size}
                  className={`brush-button ${brush.size === brushSize ? 'selected' : ''}`}
                  onClick={() => setBrushSize(brush.size)}
                >
                  {brush.name}
                </button>
              ))}
              <button
                className={`eraser-button ${isEraser ? 'selected' : ''}`}
                onClick={() => setIsEraser(!isEraser)}
              >
                Eraser
              </button>
            </div>
            <button onClick={clearCanvas}>Clear Canvas</button>
            <button onClick={skipTurn}>Skip Turn</button>
            <div className="current-word">Draw: {currentWord}</div>
          </div>
        )}
      </div>

      <div className="game-controls">
        {!isDrawer ? (
          <form onSubmit={handleGuess}>
            <input
              type="text"
              placeholder="Enter your guess"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
            />
            <button type="submit">Guess</button>
          </form>
        ) : (
          <div className="drawer-info">
            You are drawing: <strong>{currentWord}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
