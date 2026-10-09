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

// NOTE FOR MILESWEB HOSTING:
// For Nginx or Apache / cPanel reverse proxies on MilesWeb, manually update your server config:
// - Apache / cPanel (.htaccess): LimitRequestBody 536870912  and  TimeOut 600
// - Nginx: client_max_body_size 512M;  proxy_read_timeout 600s;  proxy_connect_timeout 600s;  proxy_send_timeout 600s;

app.use(express.json({ limit: '512mb' }));
app.use(express.urlencoded({ extended: true, limit: '512mb' }));

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

// Global error handling middleware for Multer and API runtime errors
app.use((err, req, res, next) => {
  console.error(`❌ Global Server Error [${req.method} ${req.url}]:`, err.stack || err);
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Production Server running on port ${port}`);
});
server.timeout = 600000;          // 10 minutes (600,000 ms)
server.keepAliveTimeout = 600000; // 10 minutes (600,000 ms)