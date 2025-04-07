exports.SocketEmitGroupMsg = 'EmitGroupMsg'; // 群聊消息
exports.SocketOnGroupMsg = 'OnGroupMsg'; // 接收群消息
exports.SocketEmitGroupJoin = 'EmitGroupJoin'; // 加入群聊
exports.SocketOnGroupWelcomeJoin = 'OnGroupWelcomeJoin'; // 欢迎加入群聊
exports.SocketEmitGroupLeave = 'EmitGroupLeave'; // 离开群聊
exports.SocketOnGroupLeave = 'OnGroupLeave'; // 用户退出广播
exports.SocketEmitTempLeaveGroup = 'EmitTempLeaveGroup'; // 暂时离开群聊
exports.SocketOnTempLeaveGroup = 'OnTempLeaveGroup'; // 暂时离开群聊
exports.SocketEmitPrivate = 'EmitPrivate'; // 私聊
exports.SocketOnPrivate = 'OnPrivate'; // 接收私聊

exports.SocketEmitUserConnect = 'EmitUserConnect'; // 用户连接
exports.SocketOnUserConnect = 'OnUserConnect'; // 用户连接广播
exports.GetEmitOnlineUsers = 'GetEmitOnlineUsers'; // 获取在线用户
exports.OnlineUsersList = 'OnlineUsersList'; // 发送用户列表
exports.SocketHeartBeat = 'SocketHeartBeat'; // 心跳

// 未读消息相关事件
exports.SocketEmitMarkRead = 'EmitMarkRead'; // 标记消息已读
exports.SocketToMarkRead = 'ToMarkRead'; // 标记消息已读
exports.SocketEmitMarkGroupRead = 'EmitMarkGroupRead'; // 标记群聊消息已读
exports.SocketToMarkGroupRead = 'ToMarkGroupRead'; // 标记群聊消息已读
exports.SocketEmitGetUnreadCount = 'EmitGetUnreadCount'; // 获取未读消息计数
exports.SocketOnUnreadCount = 'OnUnreadCount'; // 接收未读消息计数
exports.SocketOnUnreadCountUpdate = 'unreadCountUpdate'; // 未读消息计数更新
exports.SocketOnGroupUnreadUpdate = 'groupUnreadUpdate'; // 群组未读消息更新