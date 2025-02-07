import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    id: 'test-socket-id',
    on: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return jest.fn(() => mockSocket);
});

// Mock canvas context
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  stroke: jest.fn(),
  clearRect: jest.fn(),
  closePath: jest.fn(),
}));

describe('Pictionary Game Client', () => {
  let mockSocket;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Get the mock socket instance
    mockSocket = require('socket.io-client')();
  });

  test('renders initial login screen', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/enter your username/i)).toBeInTheDocument();
  });

  test('handles username input', () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/enter your username/i);
    fireEvent.change(input, { target: { value: 'testuser' } });
    expect(input.value).toBe('testuser');
  });

  test('shows error when trying to create room without username', () => {
    render(<App />);
    const createButton = screen.getByText(/create room/i);
    fireEvent.click(createButton);
    expect(screen.getByText(/please enter a username/i)).toBeInTheDocument();
  });

  test('creates room successfully', () => {
    render(<App />);
    
    // Enter username
    const input = screen.getByPlaceholderText(/enter your username/i);
    fireEvent.change(input, { target: { value: 'testuser' } });
    
    // Click create room
    const createButton = screen.getByText(/create room/i);
    fireEvent.click(createButton);
    
    // Verify socket emit was called
    expect(mockSocket.emit).toHaveBeenCalledWith('createRoom', { username: 'testuser' });
  });

  test('shows drawing controls for drawer', () => {
    render(<App />);
    
    // Simulate socket response for room join
    const mockState = {
      currentDrawer: { id: 'test-socket-id', username: 'testuser' },
      players: [{ id: 'test-socket-id', username: 'testuser', score: 0 }],
      word: 'test',
      scores: {}
    };
    
    // Find the mock socket's 'on' handler for 'gameState' and call it
    const gameStateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'gameState')[1];
    gameStateHandler(mockState);
    
    // Verify drawing controls are shown
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(screen.getByText(/clear/i)).toBeInTheDocument();
  });

  test('shows guessing interface for non-drawer', () => {
    render(<App />);
    
    // Simulate socket response for room join
    const mockState = {
      currentDrawer: { id: 'other-socket-id', username: 'otheruser' },
      players: [
        { id: 'test-socket-id', username: 'testuser', score: 0 },
        { id: 'other-socket-id', username: 'otheruser', score: 0 }
      ],
      word: 'test',
      scores: {}
    };
    
    // Find the mock socket's 'on' handler for 'gameState' and call it
    const gameStateHandler = mockSocket.on.mock.calls.find(call => call[0] === 'gameState')[1];
    gameStateHandler(mockState);
    
    // Verify guessing interface is shown
    expect(screen.getByPlaceholderText(/enter your guess/i)).toBeInTheDocument();
  });
}); 