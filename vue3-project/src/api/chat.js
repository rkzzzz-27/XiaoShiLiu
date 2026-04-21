import request from './request.js'

export const chatApi = {
  // 获取与某用户的聊天记录
  getMessages(userId, params = {}) {
    return request.get(`/chat/messages/${userId}`, { params })
  },

  // 发送消息
  sendMessage(data) {
    return request.post('/chat/messages', data)
  },

  // 标记与某用户的所有消息为已读
  markAsRead(userId) {
    return request.put(`/chat/messages/${userId}/read`)
  },

  // 获取聊天列表（最近联系人）
  getChatList() {
    return request.get('/chat/list')
  },

  // 删除单条消息
  deleteMessage(messageId) {
    return request.delete(`/chat/messages/${messageId}`)
  }
}
