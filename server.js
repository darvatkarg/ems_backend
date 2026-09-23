require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Ensure local uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
// const port = process.env.PORT || 8080;
const port = process.env.PORT || 3000;

// app.use(cors());
const allowedOrigins = [
  'https://ems.spikedace.com',
  'http://ems.spikedace.com',
  'http://localhost:5173'
];

app.use(cors({
  origin: function (origin, callback) {
    // Strip trailing slashes if present
    const cleanOrigin = origin ? origin.replace(/\/$/, '') : null;

    if (!cleanOrigin || allowedOrigins.includes(cleanOrigin)) {
      callback(null, true);
    } else {
      callback(null, false); // Clean rejection without 500 error
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests cleanly
// app.options('*', cors());

app.use(express.json());

// Serve static files from local uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/locations', require('./routes/locationRoutes'));
app.use('/api/votes', require('./routes/voteRoutes'));

app.use('/api/operators', require('./routes/operatorRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));

app.use('/api/parties', require('./routes/partyRoutes'));
app.use('/api/admins', require('./routes/adminRoutes'));

app.use('/api/candidates', require('./routes/candidateRoutes'));

app.use('/api/ward-reports', require('./routes/wardReportRoutes'));


// Keep-Alive / Health Check Route for UptimeRobot
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Server is awake', 
    timestamp: new Date().toISOString() 
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Production Server running on port ${port}`);
});