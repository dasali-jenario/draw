const http = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');
const { createServer } = require('http');

describe('Pictionary Game Server', () => {
  let io, serverSocket, clientSocket1, clientSocket2, httpServer;
  const port = 3002;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    httpServer.listen(port, () => {
      const clientOptions = {
        'force new connection': true,
        transports: ['websocket'],
        reconnection: false
      };

      clientSocket1 = Client(`http://localhost:${port}`, clientOptions);
      clientSocket2 = Client(`http://localhost:${port}`, clientOptions);

      let connectCount = 0;
      const checkDone = () => {
        connectCount++;
        if (connectCount === 2) {
          done();
        }
      };

      clientSocket1.on('connect', checkDone);
      clientSocket2.on('connect', checkDone);

      io.on('connection', (socket) => {
        serverSocket = socket;
      });
    });
  }, 30000);

  afterAll((done) => {
    io.close();
    clientSocket1.close();
    clientSocket2.close();
    httpServer.close(done);
  });

  test('should create a room successfully', (done) => {
    const roomData = {
      roomId: 'test-room',
      username: 'player1'
    };

    clientSocket1.emit('createRoom', roomData, (response) => {
      try {
        expect(response.success).toBe(true);
        expect(response.players).toContain('player1');
        expect(response.currentDrawer).toBe(clientSocket1.id);
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should not create a room that already exists', (done) => {
    const roomData = {
      roomId: 'test-room',
      username: 'player2'
    };

    clientSocket2.emit('createRoom', roomData, (response) => {
      try {
        expect(response.success).toBe(false);
        expect(response.error).toBe('Room already exists');
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should join an existing room successfully', (done) => {
    const joinData = {
      roomId: 'test-room',
      username: 'player2'
    };

    clientSocket2.emit('joinRoom', joinData, (response) => {
      try {
        expect(response.success).toBe(true);
        expect(response.players).toContain('player2');
        done();
      } catch (error) {
        done(error);
      }
    });
  }, 30000);

  test('should handle drawing events correctly', (done) => {
    const drawData = {
      room: 'test-room',
      drawData: {
        x: 100,
        y: 100,
        type: 'start'
      }
    };

    clientSocket2.on('draw', (receivedDrawData) => {
      try {
        expect(receivedDrawData).toEqual(drawData.drawData);
        done();
      } catch (error) {
        done(error);
      }
    });

    clientSocket1.emit('draw', drawData);
  }, 30000);

  test('should handle correct word guesses', (done) => {
    const guessData = {
      room: 'test-room',
      guess: 'test-word'
    };

    // First, set the word for the room
    clientSocket1.emit('setWord', { room: 'test-room', word: 'test-word' }, () => {
      clientSocket2.on('correctGuess', (data) => {
        try {
          expect(data.guesser).toBe(clientSocket2.id);
          expect(data.word).toBe('test-word');
          done();
        } catch (error) {
          done(error);
        }
      });

      // Now make the guess
      setTimeout(() => {
        clientSocket2.emit('guess', guessData);
      }, 1000);
    });
  }, 30000);

  test('should handle player disconnection correctly', (done) => {
    clientSocket1.on('playerLeft', ({ players, scores, disconnectedId }) => {
      try {
        expect(players).not.toContain('player2');
        expect(disconnectedId).toBe(clientSocket2.id);
        done();
      } catch (error) {
        done(error);
      }
    });

    clientSocket2.disconnect();
  }, 30000);
}); 