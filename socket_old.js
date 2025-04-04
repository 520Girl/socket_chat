

const socketio = require('socket.io');
const { 
    ScoketEmitGroupMsg, ScoketEmitGroupJoin,
    ScoketOnGroupMsg, ScoketOnGroupWelcomeJoin,
    ScoketEmitGroupLeave, ScoketOnGroupLeave,
    ScoketEmitPrivate, ScoketOnPrivate,
    ScoketEmitUserConnect, ScoketOnUserConnect,
    GetEmitOnlineUsers, OnlineUsersList
    } = require('./constants');

    const userList = {}; // 用户列表 {id:name}
    let onlineUsersNum = 0; // 在线人数
    let userInfoList = [] // 用户详细信息列表
module.exports = (httpServer, core) => {
    const io = socketio(httpServer, core);


    io.on('connection', (socket) => {
        console.log('创建了一个socket连接');

        // 用户连接时记录用户信息
        socket.on(ScoketEmitUserConnect, ({name,uid,img}) => {
            // 检查该uid是否已经在线
            const existingUser = userInfoList.find(user => user.uid === uid);
            if (existingUser) {
                // 如果用户已存在，更新socket id和在线状态
                existingUser.cid = socket.id;
                existingUser.online = true;
                userList[socket.id] = name;
                console.log('用户重新连接:', name, socket.id);
            } else {
                // 新用户加入
                userList[socket.id] = name;
                userInfoList.push({uid,name,img,cid:socket.id,online:true});
                onlineUsersNum++;
                console.log('新用户连接:', name, socket.id);
            }

            // 广播最新的用户列表
            io.emit(OnlineUsersList, {
                userList: userInfoList,
                onlineUsersNum: onlineUsersNum
            });

            // 广播新用户上线
            // socket.broadcast.emit(ScoketOnUserConnect, { name: name, onlineUsersNum: onlineUsersNum });
            // socket.emit(ScoketOnUserConnect, {uid,name,img,cid:socket.id,online:true,onlineUsersNum: onlineUsersNum });
        });

        // 获取在线用户列表
        socket.on(GetEmitOnlineUsers, () => {
            socket.emit(OnlineUsersList, {
                userList: userInfoList,
                onlineUsersNum: onlineUsersNum
            });
        });


        // 监听客户端群消息，并广播给其他客户端
        socket.on(ScoketEmitGroupMsg, (msg) => {
            console.log('message: ' + msg);
            // 将消息广播给其他客户端
            socket.broadcast.emit(ScoketOnGroupMsg, msg);
        });

        // 监听客户端加入群聊事件
        socket.on(ScoketEmitGroupJoin, (username) => {
            console.log('join group chat:' + username);
            // 用户已在连接时记录，这里只需处理加入群聊的逻辑
            socket.join('group-chat');
            socket.broadcast.to('group-chat').emit(ScoketOnGroupWelcomeJoin, { name: username, onlineUsersNum: onlineUsersNum });
            socket.emit(ScoketOnGroupWelcomeJoin, { name: username, onlineUsersNum: onlineUsersNum });
        });

        // 监听客户端离开事件
        socket.on('disconnecting', () => {
            console.log('用户离开了');
            this.handleUserDisconnect(socket,io);
            console.log('Client disconnected',userList);
        });
        // 监听客户端断开连接
        socket.on('disconnect', () => {
            this.handleUserDisconnect(socket,io);
            console.log('Client disconnected 连接失败断开',userList);
        });

        //一对一私聊
        socket.on(ScoketEmitPrivate, (data) => {
            const { targetSocketId, message } = data;
            console.log('private message to ' + targetSocketId + ': ' + message);
            // 将消息发送给指定的客户端
            socket.to(targetSocketId).emit(ScoketOnPrivate, {
                from: socket.id,
                fromName: userList[socket.id],
                message: message
            });
        });
    });

    return io;
};

// 个人的离线消息处理
exports.handleUserDisconnect = (socket,io) => {
    if (userList[socket.id]) {
        const username = userList[socket.id];
        delete userList[socket.id];
        
        // 找到用户并更新状态而不是删除
        const disconnectedUser = userInfoList.find(user => user.cid === socket.id);
        if (disconnectedUser) {
            disconnectedUser.online = false;
            disconnectedUser.cid = '';
        }
        onlineUsersNum--;
        
        // 广播用户离开事件
        io.emit(ScoketOnGroupLeave, { name: username, onlineUsersNum: onlineUsersNum });
        // 推送更新后的在线列表
        io.emit(OnlineUsersList, {
            userList: userInfoList,
            onlineUsersNum: onlineUsersNum
        });
    }
}