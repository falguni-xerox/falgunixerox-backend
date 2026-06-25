import express from 'express';
import multer from 'multer';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

const app = express();

// તારો Vercel URL અહીં નાખ
app.use(cors({ origin: 'https://falguni-xerox.vercel.app' }));

// Render માં ફક્ત /tmp માં જ File Save થાય
const uploadDir = '/tmp/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB Limit
});

// Upload API
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File નથી મળી' });
  }
  
  // Render ની Public URL બનાવ
  const fileUrl = `https://તારો-backend.onrender.com/uploads/${req.file.filename}`;
  res.json({ 
    url: fileUrl, 
    name: req.file.originalname,
    size: req.file.size 
  });
});

// File Download કરવા માટે
app.use('/uploads', express.static(uploadDir));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Server ${PORT} પર ચાલુ`));