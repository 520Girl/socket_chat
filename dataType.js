/**
 * 该文件用于规范前端与后端的数据结构
 */

// 基础消息结构
/** 对应类型对应字段
 * type 为text时，content为文本内容,其他类型没有该字段
 * type 为image时，mediaUrl为图片地址 thumbnailUrl略缩图地址
 * type audio, mediaUrl为音频地址 mediaDuration音频时长 thumbnailUrl为音频封面
 * type location locationData 为位置信息{
 *                        latitude: Number,     // 纬度
*                         longitude: Number,    // 经度
*                         address: String,      // 地址描述
*                         name: String          // 位置名称
*}
 */
const BaseType ={
    type: 'String',        // 消息类型：image|text|file|audio|location
    sentAt: 'String',    // 发送的时间
    content: 'String',     // 消息内容 这个是消息的文本内容
    mediaUrl: String,         // 媒体文件URL
    mediaDuration: Number,    // 语音消息持续时间（秒）
    thumbnailUrl: String,     // 图片缩略图URL
    locationData: {           // 地理位置数据
        latitude: Number,     // 纬度
        longitude: Number,    // 经度
        address: String,      // 地址描述
        name: String          // 位置名称
    },
}

const BaseMessageType = {
    id: 'String',          // 消息唯一ID 这个是在mongodb 中的消息id
    sentAt: 'Date'         // 发送时间
};

// 私聊消息结构 这个是通过接口访问返回的数据结构 返回的是聊天列表
const PrivateMessageHttpType = {
    toId: 'String',      // 列表中跳转的id
    unreadCount: 'Number',    // 未读消息数量
    lastMessage: {
        ...BaseMessageType,
        ...BaseType,
        senderName: 'String',  // 发送者名称
        senderImg: 'String',   // 发送者头像
        sentAt: 'Date',         // 发送时间
        isRead: 'Boolean',      // 是否已读
        senderId: 'String'          // 发送者id
    }
};

// 私聊消息结构 通过socket 发送的数据结构 这个是socket 传输的数据结构
const PrivateMessageSocketType = {
    ...BaseType,
    // id:'String',          // 消息唯一ID 当前的发送给谁的id，后端的时候发送者id
    // 当服务器发送给客户端需要 当前服务端发送给客户端的用户的socket.data.id socket.data.img
    name: 'String',        // 发送者名称
    img: 'String',        // 发送者头像
    sentAt: 'Date',    // 发送时间
};

// 私聊消息结构 存入redis 最后一条消息 的数据结构,不需要发送者id 和接收者id 因为redis 的键名为
const PrivateMessageRedisLastMessageType = {
    ...BaseType,
    id:'String',          // 消息唯一ID 这个是在mongodb 中的消息id
    senderName: 'String',  // 发送者名称
    senderImg: 'String',   // 发送者头像
    sentAt: 'Date',    // 发送时间
    isRead: 'Boolean'      // 是否已读
}

// 私聊消息结构 历史消息 的数据结构，应该和mongodb中的私聊消息结构一致
const PrivateMessageHistoryType = {
    ...BaseType,
    isRead: 'Boolean',      // 是否已读
    sender: 'String',      // 发送者ID
    receiver: 'String',    // 接收者ID
}
//? 私聊消息结构 监听广播未读消息类型 SocketOnUnreadCountUpdate
const PrivateMessageUnreadUpdateType = {
    ...BaseType,
    sentAt: 'Date',    // 发送时间
    content: 'String',    // 消息内容
    unreadCount: 'Number',    // 未读消息数量
    senderName: 'String',        // 也就是被接受方的昵称 用于列表
    senderImg: 'String',        // 也就是被接受方的头像 用于列表
}

//? 群聊消息结构 这个是通过接口访问返回的数据结构 返回的是聊天列表
const GroupMessageHttpType = {
    // userId: 'String',      // 当前用户ID
    groupId: 'String',      // 群组ID
    unreadCount: 'Number',    // 未读消息数量
    lastMessage: {
        ...BaseMessageType,
        ...BaseType,
        sender: 'String',      // 发送者ID
        senderName: 'String',  // 发送者名称
        isRead: 'Boolean',      // 是否已读
        groupImg: 'String',   // 发送者头像
        groupName: 'String',  // 群组名称
    }
}
//? 群聊消息结构 通过socket 发送的数据结构 这个是socket 传输的数据结构
const GroupMessageSocketType = {
    ...BaseType,
    img: 'String',      // 发送者头像
    name: 'String',    // 发送者名称
    sendAt: 'Date',    // 发送时间
}
//? 群聊消息结构 存入redis 最后一条消息 的数据结构,不需要发送者id 和接收者id 因为redis 的键名为
const GroupMessageRedisLastMessageType = {
    ...BaseType,
    id:'String',          // 消息唯一ID 这个是在mongodb 中的消息id
    senderName: 'String',  // 发送者名称
    groupName: 'String',  // 群组名称
    groupImg: 'String',  // 群组名称
    sentAt: 'Date',    // 发送时间
    isRead: 'Boolean'      // 是否已读
}

//? 群聊消息结构 历史消息 的数据结构，应该和mongodb中的群聊消息结构一致
const GroupMessageHistoryType = {
    ...BaseType,
    isRead: 'Boolean',      // 是否已读
    sender: 'String',      // 发送者ID
    receiver: 'String',    // 接收者ID
}

//? 群聊消息结构监听广播未读消息类型 SocketOnGroupUnreadUpdate
const GroupMessageUnreadUpdateType = {
    ...BaseType,
    name: 'String',      // 发送者name
    sentAt: 'Date',    // 发送时间
    groupId: 'String',      // 群组ID
    unreadCount: 'Number',    // 未读消息数量
    groupName: 'String',        // 也就是被接受方的昵称 用于列表
    groupImg: 'String',        // 也就是被接受方的头像 用于列表
}

//? 离开群组消息类型 SocketOnTempLeaveGroup
const LeaveGroupType = {
    name: 'String',      // 发送者name
    groupId: 'String',      // 群组ID
    userId: 'String',  // 发送者ID
}

const selectType = (type,data)=>{
    switch(type){
        case 'image':
            return {type: 'image', mediaUrl:data.mediaUrl,thumbnailUrl:data.thumbnailUrl}
        case 'audio':
            return {type: 'audio', mediaDuration:data.mediaDuration,mediaUrl:data.mediaUrl,thumbnailUrl:data.thumbnailUrl}
        case 'location':
            return {type: 'location', locationData:data.locationData}    
        default:
            return {type:'text',content:data.content}
    }
}
module.exports = {
    selectType
};