import mongoose from 'mongoose';

let connectionListenersRegistered = false;

function registerConnectionListeners() {
  if (connectionListenersRegistered) return;
  connectionListenersRegistered = true;

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connection established.');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB connection lost.');
  });

  mongoose.connection.on('error', () => {
    // Mongoose errors can include host details; avoid printing them verbatim.
    console.error('MongoDB reported a connection error.');
  });
}

export async function connectDatabase() {
  registerConnectionListeners();

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri || uri === 'mongodb_connection_string_here') {
    throw new Error('MONGODB_URI is not configured. Set it in server/.env.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch {
    throw new Error('Could not connect to MongoDB. Check the database URL, network access, and credentials.');
  }
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
