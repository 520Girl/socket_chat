//连接mongodb 数据 redis 数据库
const mongoose = require('mongoose');
const Redis = require('ioredis');

//连接mongodb
mongoose.connect('mongodb://root:123456@127.0.0.1:27017/chat?authSource=admin&retryWrites=true&w=majority', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.connection.on('connected', () => {
  console.log('mongodb connected success')
})
mongoose.connection.on('error', () => {
  console.log('mongodb connected error')
})

//连接redis
const redis = new Redis({
    host:'localhost',
    port:6379,
    // password:'123456'
})
// 测试连接
redis.on('connect', () => {
  console.log('Redis连接成功');
});

redis.on('error', (err) => {
  console.error('Redis连接错误:', err);
});

module.exports = {
    mongoose,
    redis
}