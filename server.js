import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();

const PORT = process.env.PORT || 10000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://falgunixerox-frontend.vercel.app";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://falgunixerox-server.onrender.com";

// ✅ CORS Fix
app.use(
  cors({
    origin: [
      FRONTEND_URL,
      "https://falgunixerox-frontend.vercel.app",
      "https://falguni-xerox.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// ✅ Render માં /tmp જ writable છે
const uploadDir = "/tmp/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ✅ Multer Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const uniqueName = `${Date.now()}-${safeName}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

// ✅ Test Route
app.get("/", (req, res) => {
  res.send("✅ Falguni Xerox Backend Running");
});

// ✅ Upload API
app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File નથી મળી" });
    }

    const fileUrl = `${BACKEND_URL}/uploads/${req.file.filename}`;

    return res.json({
      success: true,
      url: fileUrl,
      filename: req.file.filename,
      name: req.file.originalname,
      size: req.file.size,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Upload failed",
      details: error.message,
    });
  }
});

// ✅ Uploaded files public access
app.use("/uploads", express.static(uploadDir));

// ✅ Error Handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: err.message || "Server error",
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server ${PORT} પર ચાલુ`);
});