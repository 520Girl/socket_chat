const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    password: { type: String },
    img: { type: String },
    socketId: { type: String, default: '' },
    online: { type: Boolean, default: false },
    lastActive: { type: Date, default: Date.now() },
    groups: [{ // 用户加入的群组
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group'
        },
        joinTime: {
            type: Date,
            default: Date.now
        }
    }]
})

//作用：存储群组基本信息，包括群主、成员列表等。
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true }, // 群名称（必填）
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // 关联User模型，存储创建者ID
    },
    members: [{ // 成员数组
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User' // 关联User模型
        },
        joinTime: {
            type: Date,
            default: Date.now // 自动记录加入时间
        }
    }],
    avatar: {
        type: String,
        default: 'group-default.png' // 默认群头像
    },
    createdAt: {
        type: Date,
        default: Date.now // 自动记录创建时间
    }
});

// 存储所有群聊消息记录，支持多种消息类型。
const groupMessageSchema = new mongoose.Schema({
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group' // 关联Group模型
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // 关联User模型，记录发送者
    },
    content: String, // 消息内容
    type: {
        type: String,
        enum: ['text', 'image', 'audio', 'location', 'file'], // 扩展消息类型
        default: 'text' // 默认文本消息
    },
    // 多媒体内容字段
    mediaUrl: String,         // 媒体文件URL
    mediaDuration: Number,    // 语音消息持续时间（秒）
    thumbnailUrl: String,     // 图片缩略图URL
    locationData: {           // 地理位置数据
        latitude: Number,     // 纬度
        longitude: Number,    // 经度
        address: String,      // 地址描述
        name: String          // 位置名称
    },
    sentAt: {
        type: Date,
        default: Date.now // 自动记录发送时间
    },
    isRead: {
        type: Boolean,
        default: false // 消息是否已读
    },
    isDeleted: {
        type: Boolean,
        default: false // 消息是否已删除（软删除标记）
    },
    deletedAt: {
        type: Date,
        default: null // 删除时间
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // 执行删除操作的用户
    }
});
// 存储私聊消息记录
const privateMessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // 关联发送者
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // 关联接收者
    },
    content: String, // 消息内容
    type: {
        type: String,
        enum: ['text', 'image', 'audio', 'location', 'file'], // 扩展消息类型
        default: 'text' // 默认文本消息
    },
    // 多媒体内容字段
    mediaUrl: String,         // 媒体文件URL
    mediaDuration: Number,    // 语音消息持续时间（秒）
    thumbnailUrl: String,     // 图片缩略图URL
    locationData: {           // 地理位置数据
        latitude: Number,     // 纬度
        longitude: Number,    // 经度
        address: String,      // 地址描述
        name: String          // 位置名称
    },
    sentAt: {
        type: Date,
        default: Date.now // 自动记录发送时间
    },
    isRead: {
        type: Boolean,
        default: false // 消息是否已读
    },
    isDeleted: {
        type: Boolean,
        default: false // 消息是否已删除（软删除标记）
    },
    deletedAt: {
        type: Date,
        default: null // 删除时间
    },
    deletedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // 执行删除操作的用户
    }
});

module.exports = {
    User: mongoose.model('User', userSchema),
    Group: mongoose.model('Group', groupSchema),
    GroupMessage: mongoose.model('GroupMessage', groupMessageSchema),
    PrivateMessage: mongoose.model('PrivateMessage', privateMessageSchema)
}