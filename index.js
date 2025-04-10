const express = require('express');
const app = express();
// const https = require('https');
const http = require('http');
const fs = require('fs');
const router = express.Router();
const routers = require('./routers');
const uploadRouter = require('./upload');
const path = require('path');
const io = require('./socket')
require('./db');
const { initDataLayerManager } = require('./dataLayerManager');

// HTTPS配置
const httpsOptions = {
  // key: fs.readFileSync(path.join(__dirname, 'certs/localhost+1-key.pem')),
  // cert: fs.readFileSync(path.join(__dirname, 'certs/localhost+1.pem'))
};

// 初始化数据分层管理
initDataLayerManager();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true }));

// 静态文件服务，用于访问上传的媒体文件
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 创建HTTPS服务器
const server = http.createServer(httpsOptions, app);

// Socket.IO配置
io(server, {
  cors: {
    origin: "*", // 允许所有来源
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
  },
  path: "/socket.io/",  // Socket.IO路径
  transports: ['websocket', 'polling'], // 启用WebSocket和轮询
  // allowEIO3: true, // 允许Engine.IO v3客户端连接 
  pingTimeout: 60000, // 心跳超时时间
  pingInterval: 25000 // 心跳间隔
});

app.use('/', router);
app.use('/api', routers);
app.use('/api', uploadRouter);
app.use((err, req, res, next) => {
  res.status(500).json({
    msg: err.message,
    code: 500,
    status: 0
  });
})

// 使用router中间件更规范
server.listen(3008, '0.0.0.0', () => {
  console.log('Server is running on port 3008', 'ws://localhost:3008');
});