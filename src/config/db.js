const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://crosseye315_db_user:LrMl2svtb95awTW0@userdetails.unog4hy.mongodb.net/';
  if (!uri) {
    throw new Error('MONGODB_URI is not set in environment');
  }
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = connectDB;
