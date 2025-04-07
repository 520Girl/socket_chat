const router = require('express').Router();
const { User, Group, GroupMessage, PrivateMessage } = require('./model');
const mongoose = require('mongoose');
const {selectType}= require('./dataType')
const { getMessageHistory } = require('./dataLayerManager');


const login = async (req, res, next) => {
  const { name, img, online = true, password } = req.body;
  const user = await User.findOne({ name });
  if (user) {
    return res.status(200).json({
      code: 20100,
      status: 1,
      data: user,
      msg: '用户已存在',
    });
  }
  const newUser = await User.create({ name, img, password, online });
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: newUser,
    msg: '登录成功',
  });
}

// 获取用户列表
const getUserList = async (req, res, next) => {
  //   const { type } = req.query;
  const userList = await User.find();
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: userList,
    msg: '获取成功',
  });
}

//创建用户
const createUser = async (req, res, next) => {
  const { name, img } = req.body;
  userInfoList.push({
    name,
    img,
  })
  // const user = await User.create({ name, img });
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: userInfoList,
    msg: '创建成功',
  });
}
// 获取个人聊天列表 未包含未读消息
const getPrivateList = async (userId) => {
  // const { userId } = req.query;

  const messages = await PrivateMessage.aggregate([
    {
      $match: {
        $or: [
          { sender: new mongoose.Types.ObjectId(userId) },
          { receiver: new mongoose.Types.ObjectId(userId) }
        ]
      }
    },
    {
      $sort: { sentAt: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$sender', new mongoose.Types.ObjectId(userId)] },
            '$receiver',
            '$sender'
          ]
        },
        lastMessage: { $first: '$$ROOT' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $project: {
        _id: '$_id',
        name: '$userInfo.name',
        img: '$userInfo.img',
        online: '$userInfo.online',
        lastActive: '$userInfo.lastActive',
        lastMessage: {
          _id: '$lastMessage._id',
          content: '$lastMessage.content',
          type: '$lastMessage.type',
          sentAt: '$lastMessage.sentAt',
          isFromMe: { $eq: ['$lastMessage.sender', new mongoose.Types.ObjectId(userId)] },
          receiverId: {
            $cond: [
              { $eq: ['$lastMessage.sender', new mongoose.Types.ObjectId(userId)] },
              '$lastMessage.receiver',
              '$lastMessage.sender'
            ]
          }
        }
      }
    }
  ]);
  
  return messages

  // return res.status(200).json({
  //   code: 20100,
  //   status: 1,
  //   data: messages,
  //   msg: '获取私聊列表成功'
  // });
}

// 获取私聊消息历史
const getPrivateMessages = async (req, res) => {
  const { senderId, receiverId } = req.query;

  try {
    const messages = await PrivateMessage.find({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    })
      .populate('sender', 'name img')
      .populate('receiver', 'name img')
      .sort({ sentAt: 1 });

    return res.status(200).json({
      code: 20100,
      status: 1,
      data: messages,
      msg: '获取私聊消息成功'
    });
  } catch (error) {
    return res.status(500).json({
      code: 50000,
      status: 0,
      msg: '获取私聊消息失败：' + error.message
    });
  }
}


// 创建群组
const createGroup = async (req, res) => {
  const { name, creatorId, memberIds, avatar } = req.body;

  const group = await Group.create({
    name,
    avatar,
    creator: creatorId,
    members: memberIds.map(id => ({ user: id }))
  });

  return res.status(200).json({
    code: 20100,
    status: 1,
    data: group,
    msg: '群组创建成功'
  });
}

//加入群聊
const joinGroup = async (req, res) => {
  const { groupId: groupIdStr, userId: userIdStr } = req.body;
  const groupId = new mongoose.Types.ObjectId(groupIdStr);
  const userId = new mongoose.Types.ObjectId(userIdStr);

  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({
      code: 40400,
      status: 0,
      msg: '群组不存在'
    });
  }

  // 检查用户是否已经在群组中
  const isUserInGroup = group.members.some(member => member.user.toString() === userId.toString());
  if (isUserInGroup) {
    return res.status(200).json({
      code: 20100,
      status: 1,
      data: group,
      msg: '用户已在群组中'
    });
  }

  // 用户不在群组中，添加新成员
  const updatedGroup = await Group.findOneAndUpdate(
    { _id: groupId },
    { $push: { members: { user: userId, joinTime: Date.now() } } },
    { new: true }
  );

  // 将用户加入群组的记录存储到用户模型中
  await User.findOneAndUpdate(
    { _id: userId },
    { $push: { group: groupId } },
    { new: true }
  );

  return res.status(200).json({
    code: 20100,
    status: 1,
    data: updatedGroup,
    msg: '加入群组成功'
  });
};
// 获取群组列表 未包含未读消息数
const getGroupList = async (userId) => {
  // const { userId } = req.query;

  // if (!userId) {
  //   return res.status(400).json({
  //     code: 40000,
  //     status: 0,
  //     msg: '缺少必要参数userId'
  //   });
  // }

  const groupList = await Group.aggregate([
    {
      $match: {
        'members.user': new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: 'groupmessages',
        let: { groupId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$group', '$$groupId'] } } },
          { $sort: { sentAt: -1 } },
          { $limit: 1 },
          {
            $lookup: {
              from: 'users',
              localField: 'sender',
              foreignField: '_id',
              as: 'sender'
            }
          },
          { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              content: 1,
              type: 1,
              sentAt: 1,
              sender_id: '$sender._id',
              sender_name: '$sender.name',
              _id: 1
            }
          }
        ],
        as: 'lastMessage'
      }
    },
    { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        lastMessage: { $ifNull: ['$lastMessage', {}] },
        memberCount: { $size: '$members' }
      }
    },
    {
      $project: {
        name: 1,
        avatar: 1,
        createdAt: 1,
        lastMessage: 1,
        memberCount: 1
      }
    }
  ]);
  return groupList;

  // res.status(200).json({
  //   code: 20100,
  //   status: 1,
  //   data: groupList,
  //   msg: '群组列表获取成功'
  // });
}
// 获取全部群列表
const getAllGroupList = async (req, res) => {
  const groupList = await Group.aggregate([
    {
      $project: {
        name: 1,
        avatar: 1,
        memberCount: { $size: '$members' },
        memberIds: { $map: { input: '$members', as: 'member', in: '$$member.user' } }
      }
    }
  ]);
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: groupList,
    msg: '群组列表获取成功'
  })
}

// 获取群成员列表
const getGroupMembers = async (req, res) => {
  const { groupId } = req.params;

  const group = await Group.findById(groupId).populate({
    path: 'members.user', // 使用这个id查找User集合中的文档
    select: 'name img online' // 只返回这些字段 替换user
  })
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: group.members,
    msg: '群成员列表获取成功！'
  })
}

// 发送群消息
const sendGroupMessage = async (req, res) => {
  const { groupId, senderId, content, type } = req.body;

  const message = await GroupMessage.create({
    group: groupId,
    sender: senderId,
    content,
    type
  });

  // 这里需要配合socket.io广播消息
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: message,
    msg: '消息发送成功'
  });
}

// 获取群消息历史
const getGroupMessages = async (req, res) => {
  const { groupId} = req.query;
  // 直接从mongodb 获取
  const messages = await GroupMessage.find({ group: groupId })
    .sort({ sentAt: 1 })
    .populate('sender', 'name img');

  return res.status(200).json({
    code: 20100,
    status: 1,
    data: messages,
    msg: '获取群消息成功'
  });
}

// 添加路由
router.get('/group/list', getGroupList);
router.post('/group/join', joinGroup);
router.get('/group/allList', getAllGroupList);
router.get('/group/members/:groupId', getGroupMembers);
router.post('/group/create', createGroup);
router.post('/group/send', sendGroupMessage);
router.get('/group/messages', getGroupMessages);


// 获取用户未读消息计数
const getUnreadMessages = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      code: 40000,
      status: 0,
      msg: '缺少必要参数userId'
    });
  }

  try {
    // 引入optimization.js中的函数
    const { getUserUnreadMessages } = require('./optimization');

    // 获取用户所有未读消息
    const unreadMessages = await getUserUnreadMessages(userId);

    return res.status(200).json({
      code: 20100,
      status: 1,
      data: unreadMessages,
      msg: '获取未读消息成功'
    });
  } catch (error) {
    return res.status(500).json({
      code: 50000,
      status: 0,
      msg: '获取未读消息失败：' + error.message
    });
  }
};

// 标记私聊消息为已读
const markPrivateRead = async (req, res) => {
  const { userId, senderId } = req.body;

  if (!userId || !senderId) {
    return res.status(400).json({
      code: 40000,
      status: 0,
      msg: '缺少必要参数'
    });
  }

  try {
    // 引入optimization.js中的函数
    const { markPrivateMessagesAsRead } = require('./optimization');

    await markPrivateMessagesAsRead(userId, senderId);

    return res.status(200).json({
      code: 20100,
      status: 1,
      msg: '标记消息已读成功'
    });
  } catch (error) {
    return res.status(500).json({
      code: 50000,
      status: 0,
      msg: '标记消息已读失败：' + error.message
    });
  }
};

// 标记群组消息为已读
const markGroupRead = async (req, res) => {
  const { userId, groupId } = req.body;

  if (!userId || !groupId) {
    return res.status(400).json({
      code: 40000,
      status: 0,
      msg: '缺少必要参数'
    });
  }

  try {
    // 引入optimization.js中的函数
    const { markGroupMessagesAsRead } = require('./optimization');

    await markGroupMessagesAsRead(userId, groupId);

    return res.status(200).json({
      code: 20100,
      status: 1,
      msg: '标记群组消息已读成功'
    });
  } catch (error) {
    return res.status(500).json({
      code: 50000,
      status: 0,
      msg: '标记群组消息已读失败：' + error.message
    });
  }
};

//? 获取群聊和私聊列表
const getChatList = async (req, res,next) => {
  try{
    const { userId } = req.body;
    // 获取未读消息数据
    const { getUserUnreadMessages } = require('./optimization');
    const unreadMessages = await getUserUnreadMessages(userId);
    const PrivateList = await getPrivateList(userId);
    const GroupList = await getGroupList(userId);

    // 将未读消息数据添加到聊天列表中
    let messagesWithUnread = {private:[], group:[]};
    PrivateList.forEach(chat => {
      const senderId = chat._id.toString();
      const privateUnread = unreadMessages.private.find(item => item?.lastMessage?.senderId === senderId);
      let newUnread = {}
      if(privateUnread){
        newUnread = {
          userId, //被聊天者id
          unreadCount: privateUnread.unreadCount,
          lastMessage: privateUnread.lastMessage
        }
      }else{
        newUnread = {
          userId,
          unreadCount: 0,
          lastMessage: {
              id: chat.lastMessage._id,
              senderName: chat.name,
              senderImg: chat.img,
              isRead:true,
              senderId:chat.lastMessage.receiverId,
              ...selectType(chat.type,chat.lastMessage),
              sentAt: chat.lastMessage.sentAt,
          }
        }
      }
      messagesWithUnread.private.push(newUnread)
    })

    GroupList.forEach(chat => {
      const groupId = chat._id.toString();
      const groupUnread = unreadMessages.group.find(item => item?.groupId === groupId);
      let newUnread = {}
      if(groupUnread){
        newUnread = {
          groupId,
          unreadCount: groupUnread.unreadCount,
          lastMessage: groupUnread.lastMessage
        }
      }else{
        newUnread = {
          groupId: chat._id,
          unreadCount: 0,
          lastMessage: {
              id: chat.lastMessage._id,
              ...selectType(chat.type,chat.lastMessage),
              sentAt: chat.lastMessage.sentAt,
              senderName: chat.lastMessage.sender_name,
              isRead:true,
              groupImg: chat.avatar,
              groupName: chat.name
          }
        }
      }
      messagesWithUnread.group.push(newUnread)
    })
    return res.status(200).json({
      code: 20100,
      status: 1,
      data: messagesWithUnread,
      msg: '获取聊天列表成功'
    });
  } catch (error) {
next(error);
}
}

//? 查询工人和群聊天记录
const getAllChatMessages = async (req, res, next) => {
  const { userId, chatId } = req.query;
  const pageSize = parseInt(req.query.pageSize) || 20;  // 默认20条
  const page = parseInt(req.query.page) || 1;  // 默认第1页
  const isGroup = req.query.isGroup == 'true';  // 转换为布尔值
  const {messages,total} = await getMessageHistory(userId, chatId,isGroup,pageSize,page);
  const users = await User.find().select('name img').lean();
  // console.log('messages',users)
  // 直接从mongodb 获取
  // const messages = await GroupMessage.find({ group: groupId })
  //   .sort({ sentAt: 1 })
  //   .populate('sender', 'name img');
  if(isGroup != true){
    messages.forEach(message => {
      const user = users.find(user => user._id?.toString() === message.sender?.toString());
      message.img = user?.img;
    })
  }else{
    messages.forEach(message => {
      const user = users.find(user => user._id?.toString() === message.sender?.toString());
      message.img = user?.img;
      message.name = user?.name;
    })
  }
  return res.status(200).json({
    code: 20100,
    status: 1,
    data: messages,
    total,
    page,
    pageSize,
    msg: '获取群消息成功'
  });
}


router.get('/private/messages', getPrivateMessages);
router.get('/userChatList', getUserList);
router.post('/createUser', createUser);
router.post('/login', login);
router.get('/private/List', getPrivateList);
router.get('/unread', getUnreadMessages);
router.post('/markPrivateRead', markPrivateRead);
router.post('/group/markGroupRead', markGroupRead);
router.post('/chatList', getChatList);
router.get('/chatMessages', getAllChatMessages);

module.exports = router