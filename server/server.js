require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// CONFIGURATION

const PORT = process.env.PORT || 4000;

const MONGODB_URI = process.env.MONGO_URI;

console.log("MongoDB URI:", MONGODB_URI);
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";



const app = express();

// FIXED CORS Configuration
app.use(cors({
  origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Range"]
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { 
    origin: ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"]
  } 
});

// CONNECT MONGODB

mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Atlas connected successfully"))
  .catch((err) => {
    console.error("❌ MongoDB Atlas connection error:", err);
    process.exit(1);
  });


// DEFINE SCHEMAS

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const videoSchema = new mongoose.Schema({
  videoId: { type: String, required: true, unique: true },
  filename: String,
  originalName: String,
  size: Number,
  status: { type: String, default: "uploaded" },
  createdAt: { type: Date, default: Date.now },
  processingStage: { type: String, default: "queued" },
  processingPercent: { type: Number, default: 0 },
  userId: { type: String, required: true },
  userEmail: { type: String, required: true }
});

const User = mongoose.model("User", userSchema);
const Video = mongoose.model("Video", videoSchema);


//  AUTHENTICATION MIDDLEWARE

const authenticateToken = (req, res, next) => {
  // Skip authentication for OPTIONS preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};


//  MULTER STORAGE CONFIG

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${unique}-${file.originalname.replace(/\s+/g, "_")}`);
  },
});
const upload = multer({ storage });


// 🔌 SOCKET.IO CONNECTION HANDLER

io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("join", (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room ${room}`);
    socket.emit("joined", room);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});


//  AUTHENTICATION ENDPOINTS

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    const user = await User.create({
      userId,
      email,
      password: hashedPassword,
      name
    });

    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user.userId, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});


//  UPLOAD ENDPOINT (PROTECTED)

app.post("/api/videos", authenticateToken, upload.single("video"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file received" });
    }

    const videoId = uuidv4();

    const newVideo = await Video.create({
      videoId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      status: "uploaded",
      processingStage: "queued",
      processingPercent: 0,
      userId: req.user.userId,
      userEmail: req.user.email
    });

    res.json({ success: true, videoId, fileInfo: newVideo });

    simulateProcessing(videoId, req.user.userId);
  } catch (err) {
    console.error("❌ Upload error:", err);
    res.status(500).json({ message: "Server error during upload" });
  }
});

//  VIDEO STREAMING ENDPOINT (FIXED)

app.get("/api/videos/:filename/stream", authenticateToken, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Verify user owns this video
    const video = await Video.findOne({ filename, userId: req.user.userId });
    if (!video) {
      return res.status(404).json({ message: "Video not found or access denied" });
    }

    const filePath = path.join(uploadDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Video file not found on server" });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set proper headers for video streaming
    const headers = {
      'Content-Type': 'video/mp4',
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': req.headers.origin || 'http://localhost:5173',
      'Access-Control-Allow-Credentials': 'true'
    };

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = (end - start) + 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`
        });
        return res.end();
      }

      headers['Content-Range'] = `bytes ${start}-${end}/${fileSize}`;
      headers['Content-Length'] = chunksize;
      
      res.writeHead(206, headers);
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error("❌ Streaming error:", err);
    res.status(500).json({ message: "Streaming error" });
  }
});


//  FETCH USER VIDEOS ENDPOINT (PROTECTED)

app.get("/api/videos", authenticateToken, async (req, res) => {
  try {
    const videos = await Video.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ message: "Failed to fetch videos" });
  }
});


//  SERVE UPLOADED FILES STATICALLY (PROTECTED)

app.use("/uploads", authenticateToken, express.static(uploadDir));

//  SIMULATED PROCESSING LOGIC

async function simulateProcessing(videoId, userId) {
  io.to(videoId).emit("processing:update", {
    videoId,
    stage: "queued",
    percent: 0,
  });

  setTimeout(() => {
    let pct = 0;
    const iv = setInterval(async () => {
      pct += Math.floor(Math.random() * 15) + 5;
      if (pct > 100) pct = 100;

      const stage = "processing";
      io.to(videoId).emit("processing:update", { videoId, stage, percent: pct });

      await Video.findOneAndUpdate(
        { videoId, userId },
        { processingStage: stage, processingPercent: pct }
      );

      if (pct >= 100) {
        clearInterval(iv);
        const flagged = Math.random() < 0.1;
        const finalStage = flagged ? "flagged" : "ready";
        io.to(videoId).emit("processing:update", {
          videoId,
          stage: finalStage,
          percent: 100,
        });

        await Video.findOneAndUpdate(
          { videoId, userId },
          {
            processingStage: finalStage,
            processingPercent: 100,
            status: finalStage,
          }
        );
      }
    }, 800);
  }, 600);
}


//  START SERVER

server.listen(PORT, () => {
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
});