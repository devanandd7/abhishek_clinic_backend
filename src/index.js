require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const cloudinary = require('./config/cloudinary');

const app = express();

app.use(cors());
app.use(express.json());

async function ensureCloudinaryFolder() {
  try {
    await cloudinary.api.create_folder('abhishek_clinic_user_img');
    console.log('Cloudinary folder ensured: abhishek_clinic_user_img');
    await cloudinary.api.create_folder('abhishek_clinic_user_img/admin_img');
    console.log('Cloudinary subfolder ensured: abhishek_clinic_user_img/admin_img');
  } catch (err) {
    // If folder already exists, Cloudinary returns an error with http_code 409; ignore this
    if (err && (err.http_code === 409 || /already exists/i.test(err.message || ''))) {
      console.log('Cloudinary folder already exists (ignored).');
    } else {
      console.warn('Could not ensure Cloudinary folder:', err.message || err);
    }
  }
}

connectDB().catch((err) => {
  console.error('Failed to connect to MongoDB:', err.message);
  process.exit(1);
});

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'backend_clinic' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/public', require('./routes/public'));

const PORT = process.env.PORT;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await ensureCloudinaryFolder();
});
