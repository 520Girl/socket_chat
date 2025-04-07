/**
 * Socket.io 实时聊天系统测试案例
 * 包含各种类型消息的测试数据，用于测试多媒体消息功能
 */

// 测试用户数据
const testUsers = [
  { _id: '60d5ec9af682fbd12a0f4a1e', name: '张三', img: 'avatar1.png', socketId: 'socket-id-1' },
  { _id: '60d5ec9af682fbd12a0f4a1f', name: '李四', img: 'avatar2.png', socketId: 'socket-id-2' },
  { _id: '60d5ec9af682fbd12a0f4a20', name: '王五', img: 'avatar3.png', socketId: 'socket-id-3' }
];

// 测试群组数据
const testGroups = [
  {
    _id: '60d5ec9af682fbd12a0f4a21',
    name: '技术交流群',
    creator: '60d5ec9af682fbd12a0f4a1e',
    members: [
      { user: '60d5ec9af682fbd12a0f4a1e', joinTime: new Date() },
      { user: '60d5ec9af682fbd12a0f4a1f', joinTime: new Date() },
      { user: '60d5ec9af682fbd12a0f4a20', joinTime: new Date() }
    ],
    avatar: 'group1.png'
  }
];

// ==================== 私聊消息测试案例 ====================

// 1. 文本消息测试案例
const textMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f', // 接收者ID
  msg: '你好，这是一条测试文本消息',
  type: 'text'
};

// 2. 图片消息测试案例
const imageMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '发送了一张图片',
  type: 'image',
  mediaUrl: '/uploads/images/test-image-123.jpg',
  thumbnailUrl: '/uploads/images/thumbnails/test-image-123_thumb.jpg'
};

// 3. 语音消息测试案例
const audioMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '', // 语音消息通常内容为空
  type: 'audio',
  mediaUrl: '/uploads/audio/test-voice-123.mp3',
  mediaDuration: 15 // 15秒
};

// 4. 位置消息测试案例
const locationMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '我在这里',
  type: 'location',
  locationData: {
    latitude: 39.9042,
    longitude: 116.4074,
    address: '北京市东城区天安门',
    name: '天安门'
  }
};

// 5. 文件消息测试案例
const fileMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '发送了一个文件',
  type: 'file',
  mediaUrl: '/uploads/files/document.pdf'
};

// 6. 边界测试：超长文本消息
const longTextMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '这是一条非常长的测试消息，用于测试系统对长文本的处理能力。'.repeat(20), // 重复20次
  type: 'text'
};

// 7. 边界测试：特殊字符消息
const specialCharsMessageTest = {
  toUid: '60d5ec9af682fbd12a0f4a1f',
  msg: '特殊字符测试：!@#$%^&*()_+{}|:<>?[];\',./-=`~"\\',
  type: 'text'
};

// ==================== 群聊消息测试案例 ====================

// 1. 群聊文本消息测试案例
const groupTextMessageTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  senderId: '60d5ec9af682fbd12a0f4a1e',
  content: '大家好，这是一条群聊测试消息',
  type: 'text'
};

// 2. 群聊图片消息测试案例
const groupImageMessageTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  senderId: '60d5ec9af682fbd12a0f4a1e',
  content: '发送了一张图片',
  type: 'image',
  mediaUrl: '/uploads/images/group-image-123.jpg',
  thumbnailUrl: '/uploads/images/thumbnails/group-image-123_thumb.jpg'
};

// 3. 群聊语音消息测试案例
const groupAudioMessageTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  senderId: '60d5ec9af682fbd12a0f4a1e',
  content: '',
  type: 'audio',
  mediaUrl: '/uploads/audio/group-voice-123.mp3',
  mediaDuration: 20 // 20秒
};

// 4. 群聊位置消息测试案例
const groupLocationMessageTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  senderId: '60d5ec9af682fbd12a0f4a1e',
  content: '我们在这里集合',
  type: 'location',
  locationData: {
    latitude: 31.2304,
    longitude: 121.4737,
    address: '上海市黄浦区人民广场',
    name: '人民广场'
  }
};

// 5. 群聊文件消息测试案例
const groupFileMessageTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  senderId: '60d5ec9af682fbd12a0f4a1e',
  content: '分享了一个文件',
  type: 'file',
  mediaUrl: '/uploads/files/presentation.pptx'
};

// ==================== Socket.io 事件测试案例 ====================

// 1. 用户连接事件测试
const userConnectTest = {
  name: '新用户',
  img: 'new-avatar.png',
  _id: '60d5ec9af682fbd12a0f4a22'
};

// 2. 标记私聊消息已读测试
const markPrivateReadTest = {
  senderId: '60d5ec9af682fbd12a0f4a1f'
};

// 3. 标记群组消息已读测试
const markGroupReadTest = {
  groupId: '60d5ec9af682fbd12a0f4a21'
};

// 4. 获取未读消息计数测试
const getUnreadCountTest = {
  userId: '60d5ec9af682fbd12a0f4a1e'
};

// 5. 临时离开群组测试
const tempLeaveGroupTest = {
  groupId: '60d5ec9af682fbd12a0f4a21',
  userId: '60d5ec9af682fbd12a0f4a1e'
};

// ==================== 使用示例 ====================

/**
 * 使用方法示例：
 * 
 * 1. 私聊文本消息发送
 * socket.emit('private_message', textMessageTest);
 * 
 * 2. 私聊图片消息发送
 * socket.emit('private_message', imageMessageTest);
 * 
 * 3. 群聊消息发送
 * socket.emit('group_message', groupTextMessageTest);
 * 
 * 4. 标记私聊消息已读
 * socket.emit('mark_private_read', markPrivateReadTest);
 */

module.exports = {
  // 测试数据
  testUsers,
  testGroups,
  
  // 私聊消息测试
  textMessageTest,
  imageMessageTest,
  audioMessageTest,
  locationMessageTest,
  fileMessageTest,
  longTextMessageTest,
  specialCharsMessageTest,
  
  // 群聊消息测试
  groupTextMessageTest,
  groupImageMessageTest,
  groupAudioMessageTest,
  groupLocationMessageTest,
  groupFileMessageTest,
  
  // 事件测试
  userConnectTest,
  markPrivateReadTest,
  markGroupReadTest,
  getUnreadCountTest,
  tempLeaveGroupTest
};