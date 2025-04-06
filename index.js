const express = require('express');
const app = express();
const http = require('http').createServer(app);
const router = express.Router();
const routers = require('./routers');
const io = require('./socket')
require('./db');
const { initDataLayerManager } = require('./dataLayerManager');

// 初始化数据分层管理
initDataLayerManager();
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({ extended: true })); 
io(http,{
    cors: {
      origin: "*", // 或者使用 "*" 允许所有来源
      methods: ["GET", "POST"]
    },
    path: "/socket.io/"  // 明确指定路径
  });

app.use('/', router);
app.use('/api', routers);
app.use((err, req, res, next) => {
    res.status(500).json({
        msg: err.message,
        code: 500,
        status: 0
    });
})

// 使用router中间件更规范
http.listen(3008, '0.0.0.0', () => {
    console.log('Server is running on port 3008', 'http://localhost:3008');
});