const router = require('express').Router();
const { User, Group, GroupMessage, PrivateMessage } = require('./model');
const mongoose = require('mongoose');


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
// 获取个人聊天列表
const getPrivateList = async (req, res) => {
  const { userId } = req.query;

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

  return res.status(200).json({
    code: 20100,
    status: 1,
    data: messages,
    msg: '获取私聊列表成功'
  });
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
  const { groupId, userId } = req.body;

  const group = await Group.findOneAndUpdate(
    { _id: groupId },
    { $push: { members: { user: userId, joinTime: Date.now() } } },
    { new: true }
  );
  // 将用户加入群组的记录存储到用户模型中
  await User.findOneAndUpdate(
    { _id: userId },
    { $push: { groups: groupId } },
    { new: true }
  )

  return res.status(200).json({
    code: 20100,
    status: 1,
    data: group,
    msg: '加入群组成功'
  })
}
// 获取群组列表
const getGroupList = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({
      code: 40000,
      status: 0,
      msg: '缺少必要参数userId'
    });
  }

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
              _id: 0
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
  res.status(200).json({
    code: 20100,
    status: 1,
    data: groupList,
    msg: '群组列表获取成功'
  });
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
  const { groupId } = req.query;

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

router.get('/private/messages', getPrivateMessages);
router.get('/userChatList', getUserList);
router.post('/createUser', createUser);
router.post('/login', login);
router.get('/private/List', getPrivateList);
router.get('/unread', getUnreadMessages);
router.post('/markPrivateRead', markPrivateRead);
router.post('/markGroupRead', markGroupRead);

module.exports = router