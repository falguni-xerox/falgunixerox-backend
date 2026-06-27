import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import { PDFDocument } from "pdf-lib";

const app = express();

const PORT = process.env.PORT || 10000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://falgunixerox-frontend.vercel.app";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://falgunixerox-backend.onrender.com";

app.use(
  cors({
    origin: [
      FRONTEND_URL,
      "https://falgunixerox-frontend.vercel.app",
      "https://falgunixerox.in",
      "https://www.falgunixerox.in",
      "https://falguni-xerox.vercel.app",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

const uploadDir = "/tmp/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const jobs = {};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    cb(null, `${Date.now()}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

app.get("/", (req, res) => {
  res.send("Falguni Xerox Backend Running");
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "File not found" });
    }

    let pages = 1;

    if (req.file.mimetype === "application/pdf") {
      const pdfBytes = fs.readFileSync(req.file.path);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pages = pdfDoc.getPageCount();
    }

    const jobId = req.file.filename;
    const fileUrl = `${BACKEND_URL}/uploads/${req.file.filename}`;

    jobs[jobId] = {
      jobId,
      token: null,
      status: "uploaded",
      fileUrl,
      localPath: req.file.path,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      pages,
      copies: 1,
      printType: "single",
      printRange: "all",
      customPages: "",
      amount: 0,
      createdAt: new Date().toISOString(),
      cashCreatedAt: null,
      printedAt: null,
    };

    return res.json({
      success: true,
      jobId,
      pages,
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

app.post("/api/jobs/:jobId/cash", (req, res) => {
  const { copies, printType, printRange, customPages, amount } = req.body;
  const jobId = req.params.jobId;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  if (jobs[jobId].token) {
    return res.json({
      success: true,
      token: jobs[jobId].token,
      jobId,
      amount: jobs[jobId].amount,
      alreadyCreated: true,
    });
  }

  const token = Math.floor(1000 + Math.random() * 9000);

  jobs[jobId] = {
    ...jobs[jobId],
    token,
    status: "pending_print",
    copies: Number(copies || 1),
    printType: printType || "single",
    printRange: printRange || "all",
    customPages: customPages || "",
    amount: Number(amount || 0),
    cashCreatedAt: new Date().toISOString(),
  };

  return res.json({
    success: true,
    token,
    jobId,
    amount: jobs[jobId].amount,
  });
});

app.get("/api/jobs/pending", (req, res) => {
  const pendingJobs = Object.values(jobs).filter(
    (job) => job.status === "pending_print"
  );

  return res.json({
    success: true,
    jobs: pendingJobs,
  });
});

app.post("/api/jobs/:jobId/printed", (req, res) => {
  const jobId = req.params.jobId;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  jobs[jobId].status = "printed";
  jobs[jobId].printedAt = new Date().toISOString();

  return res.json({
    success: true,
    jobId,
  });
});

app.get("/api/jobs/recent", (req, res) => {
  const recentJobs = Object.values(jobs)
    .filter((job) => job.token)
    .sort((a, b) => {
      const ta = new Date(a.cashCreatedAt || a.createdAt).getTime();
      const tb = new Date(b.cashCreatedAt || b.createdAt).getTime();
      return tb - ta;
    })
    .slice(0, 30);

  return res.json({
    success: true,
    jobs: recentJobs,
  });
});

app.post("/api/jobs/:jobId/pay/checkout-order", (req, res) => {
  return res.status(501).json({
    success: false,
    error: "Online payment is not configured yet",
  });
});

app.post("/api/payment/verify", (req, res) => {
  return res.json({
    success: true,
  });
});

app.use("/uploads", express.static(uploadDir));

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
  console.log(`Server running on port ${PORT}`);
});