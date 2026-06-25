const express = require('express');
const multer = require('multer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// File Upload માટે Multer
const upload = multer({ storage: multer.memoryStorage() });

// Test Route
app.get('/', (req, res) => {
  res.send('Falgunixerox Server Live 🔥');
});

// File Upload Route - Uploadthing માટે
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    // અહીં પાછળથી Uploadthing નો Code નાખીશું
    res.json({ message: 'File મળી ગઈ', filename: req.file.originalname });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});