// Server configuration
const getServerURL = () => {
  if (process.env.REACT_APP_SERVER_URL) {
    return process.env.REACT_APP_SERVER_URL;
  }
  
  if (process.env.NODE_ENV === 'production') {
    // Production server URL
    return 'https://draw-server-wwf0.onrender.com';
  }
  
  return `http://${window.location.hostname}:3001`;
};

export const SERVER_URL = getServerURL();

// Log the server URL for debugging
console.log('Connecting to server at:', SERVER_URL); 