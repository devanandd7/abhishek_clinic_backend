const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dtdfmnfr1',
  api_key: process.env.CLOUDINARY_API_KEY || '417269152263274',
  api_secret: process.env.CLOUDINARY_API_SECRET || 's3SpVKlxV-rvK9XmGLhJKNWD0iE'
});

module.exports = cloudinary;
