# express-chat

## 进度

登录注册 ✅  
好友关系 ✅  
群组 ✅  
1v1 聊天 ✅  
群聊 ✅  
查询最近聊天会话有问题 查不出群聊来。 ✅
消息加密

发送群消息 如果是自己发的 自己的 socket 也会收到

## 完整功能

1.node 基础 2.登录注册 3.好友关系 4.群组 5.聊天 单聊 6.聊天 群聊 7.前端部分
8 登录注册
9 加好友
10 群组
11 聊天

```
express-chat
├─ .gitignore
├─ .prettierignore
├─ .prettierrc
├─ LICENSE
├─ README.md
├─ app.js
├─ config
│  └─ config.default.js
├─ controller
│  ├─ conversationController.js
│  ├─ friendController.js
│  ├─ groupsController.js
│  ├─ messageController.js
│  ├─ testController.js
│  └─ userController.js
├─ index.html
├─ middleware
│  ├─ authMiddleware
│  │  └─ index.js
│  ├─ responseMiddleware
│  │  └─ index.js
│  └─ validation
│     ├─ errorBack.js
│     ├─ firendValidation.js
│     ├─ groupsValidation.js
│     └─ userValidation.js
├─ model
│  ├─ conversationModel.js
│  ├─ friendModel.js
│  ├─ groupsModel.js
│  ├─ index.js
│  ├─ messageModel.js
│  ├─ testModel.js
│  └─ userModel.js
├─ package.json
├─ router
│  ├─ conversationRouters.js
│  ├─ friendRouters.js
│  ├─ groupsRouters.js
│  ├─ index.js
│  ├─ messageRouters.js
│  ├─ test.js
│  └─ userRoutes.js
├─ services
│  ├─ conversationService.js
│  ├─ friendService.js
│  ├─ groupsService.js
│  ├─ messageService.js
│  ├─ testService.js
│  └─ userService.js
├─ socket
│  └─ index.js
├─ test.js
└─ utils
   ├─ authUtils.js
   ├─ createUserId.js
   └─ index.j
```
