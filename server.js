import express from "express";
import multer from "multer";
import cors from "cors";
import fs from "fs";
import crypto from "crypto";
import Razorpay from "razorpay";
import { PDFDocument } from "pdf-lib";

const app = express();

const PORT = process.env.PORT || 10000;

const FRONTEND_URL = process.env.FRONTEND_URL || "https://falgunixerox.in";

const BACKEND_URL =
  process.env.BACKEND_URL || "https://falgunixerox-backend.onrender.com";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
  limits: { fileSize: 100 * 1024 * 1024 },
});

function calculateAmount(job, copies, printType, printRange, customPages) {
  const copyCount = Number(copies || 1);
  let selectedPages = job.pages || 1;

  if (printRange === "custom" && customPages) {
    const pages = [];

    String(customPages)
      .split(",")
      .forEach((part) => {
        const clean = part.trim();
        if (!clean) return;

        if (clean.includes("-")) {
          const [start, end] = clean.split("-").map(Number);
          if (start && end && start <= end) {
            for (let i = start; i <= end; i++) pages.push(i);
          }
        } else {
          const pageNum = Number(clean);
          if (pageNum) pages.push(pageNum);
        }
      });

    selectedPages = [...new Set(pages)].filter(
      (p) => p >= 1 && p <= job.pages
    ).length;
  }

  const isDuplex = printType === "duplex_long" || printType === "duplex_short";

  const billableUnits = isDuplex ? Math.ceil(selectedPages / 2) : selectedPages;

  const rate = selectedPages <= 5 ? 5 : isDuplex ? 3.5 : 3;

  const amount = Math.round(billableUnits * rate * copyCount);

  return {
    selectedPages,
    billableUnits,
    rate,
    amount,
  };
}

app.get("/", (req, res) => {
  res.send("Falguni Xerox Backend Running");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Falguni Xerox Backend Running",
    time: new Date().toISOString(),
    razorpayConfigured: Boolean(
      process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
    ),
  });
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
      selectedPages: pages,
      amount: 0,
      price: 0,
      payment: null,
      razorpayOrderId: null,
      razorpayPaymentId: null,
      createdAt: new Date().toISOString(),
      cashCreatedAt: null,
      cashPaidAt: null,
      onlineCreatedAt: null,
      razorpayPaidAt: null,
      printingStartedAt: null,
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
  const { copies, printType, printRange, customPages } = req.body;
  const jobId = req.params.jobId;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  const result = calculateAmount(
    jobs[jobId],
    copies,
    printType,
    printRange,
    customPages
  );

  const token = jobs[jobId].token || Math.floor(1000 + Math.random() * 9000);

  jobs[jobId] = {
    ...jobs[jobId],
    token,
    status: "pending_print",
    copies: Number(copies || 1),
    printType: printType || "single",
    printRange: printRange || "all",
    customPages: customPages || "",
    selectedPages: result.selectedPages,
    billableUnits: result.billableUnits,
    rate: result.rate,
    amount: result.amount,
    price: result.amount,
    payment: {
      method: "cash",
      status: "paid",
    },
    cashCreatedAt: jobs[jobId].cashCreatedAt || new Date().toISOString(),
    cashPaidAt: new Date().toISOString(),
  };

  return res.json({
    success: true,
    token,
    jobId,
    amount: result.amount,
  });
});

app.post("/api/jobs/:jobId/pay/checkout-order", async (req, res) => {
  try {
    const { copies, printType, printRange, customPages } = req.body;
    const jobId = req.params.jobId;

    if (!jobs[jobId]) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({
        success: false,
        error: "Razorpay keys not configured",
      });
    }

    const result = calculateAmount(
      jobs[jobId],
      copies,
      printType,
      printRange,
      customPages
    );

    if (result.amount <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid amount",
      });
    }

    const order = await razorpay.orders.create({
      amount: result.amount * 100,
      currency: "INR",
      receipt: jobId.slice(0, 40),
      notes: {
        jobId,
        shop: "Falguni Xerox",
      },
    });

    jobs[jobId] = {
      ...jobs[jobId],
      status: "razorpay_pending",
      copies: Number(copies || 1),
      printType: printType || "single",
      printRange: printRange || "all",
      customPages: customPages || "",
      selectedPages: result.selectedPages,
      billableUnits: result.billableUnits,
      rate: result.rate,
      amount: result.amount,
      price: result.amount,
      razorpayOrderId: order.id,
      payment: {
        method: "online",
        status: "created",
        orderId: order.id,
      },
      onlineCreatedAt: new Date().toISOString(),
    };

    return res.json({
      success: true,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      shopName: "Falguni Xerox",
      jobId,
    });
  } catch (error) {
    console.error("Razorpay order error:", error);
    return res.status(500).json({
      success: false,
      error: "Payment order create failed",
      details: error.message,
    });
  }
});

app.post("/api/payment/verify", (req, res) => {
  try {
    const {
      jobId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!jobs[jobId]) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    if (
      jobs[jobId].status === "printed" ||
      jobs[jobId].status === "pending_print" ||
      jobs[jobId].status === "printing"
    ) {
      return res.json({
        success: true,
        token: jobs[jobId].token,
        jobId,
        alreadyPaid: true,
      });
    }

    if (jobs[jobId].razorpayOrderId !== razorpay_order_id) {
      return res.status(400).json({
        success: false,
        error: "Order ID mismatch",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Invalid payment signature",
      });
    }

    const token = jobs[jobId].token || Math.floor(1000 + Math.random() * 9000);

    jobs[jobId] = {
      ...jobs[jobId],
      token,
      status: "pending_print",
      payment: {
        method: "online",
        status: "paid",
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
      },
      razorpayPaymentId: razorpay_payment_id,
      razorpayPaidAt: new Date().toISOString(),
    };

    return res.json({
      success: true,
      token,
      jobId,
      amount: jobs[jobId].amount,
    });
  } catch (error) {
    console.error("Payment verify error:", error);
    return res.status(500).json({
      success: false,
      error: "Payment verification failed",
      details: error.message,
    });
  }
});

app.get("/api/jobs/pending", (req, res) => {
  const pendingJobs = Object.values(jobs).filter(
    (job) => job.status === "pending_print"
  );

  pendingJobs.forEach((job) => {
    job.status = "printing";
    job.printingStartedAt = new Date().toISOString();
  });

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
      const ta = new Date(
        a.razorpayPaidAt ||
          a.cashCreatedAt ||
          a.printingStartedAt ||
          a.createdAt
      ).getTime();

      const tb = new Date(
        b.razorpayPaidAt ||
          b.cashCreatedAt ||
          b.printingStartedAt ||
          b.createdAt
      ).getTime();

      return tb - ta;
    })
    .slice(0, 30);

  return res.json({
    success: true,
    jobs: recentJobs,
  });
});

app.get("/api/admin/orders", (req, res) => {
  const orders = Object.values(jobs)
    .filter((job) => job.token || job.status !== "uploaded")
    .sort((a, b) => {
      const ta = new Date(
        a.razorpayPaidAt ||
          a.onlineCreatedAt ||
          a.cashCreatedAt ||
          a.printingStartedAt ||
          a.createdAt
      ).getTime();

      const tb = new Date(
        b.razorpayPaidAt ||
          b.onlineCreatedAt ||
          b.cashCreatedAt ||
          b.printingStartedAt ||
          b.createdAt
      ).getTime();

      return tb - ta;
    });

  return res.json(orders);
});

app.post("/api/admin/orders/:jobId/status", (req, res) => {
  const jobId = req.params.jobId;
  const { status } = req.body;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  jobs[jobId].status = status;

  if (status === "printed" || status === "done") {
    jobs[jobId].printedAt = new Date().toISOString();
  }

  return res.json({
    success: true,
    jobId,
    status,
  });
});

app.post("/api/admin/jobs/:jobId/cash-paid", (req, res) => {
  const jobId = req.params.jobId;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  jobs[jobId].status = "pending_print";
  jobs[jobId].payment = {
    method: "cash",
    status: "paid",
  };
  jobs[jobId].cashPaidAt = new Date().toISOString();

  return res.json({
    success: true,
    jobId,
  });
});

app.post("/api/admin/jobs/:jobId/reprint", (req, res) => {
  const jobId = req.params.jobId;

  if (!jobs[jobId]) {
    return res.status(404).json({
      success: false,
      error: "Job not found",
    });
  }

  jobs[jobId].status = "pending_print";
  jobs[jobId].reprintAt = new Date().toISOString();

  return res.json({
    success: true,
    jobId,
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