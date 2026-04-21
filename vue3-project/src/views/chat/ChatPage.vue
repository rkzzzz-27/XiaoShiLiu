<template>
  <div class="chat-page">
    <!-- 顶部导航栏 -->
    <div class="chat-header">
      <button class="back-btn" @click="goBack">
        <SvgIcon name="back" width="24" height="24" />
      </button>
      <div class="chat-user-info">
        <img :src="chatUser.avatar || defaultAvatar" class="chat-avatar" @error="handleAvatarError" />
        <span class="chat-nickname">{{ chatUser.nickname || '用户' }}</span>
      </div>
      <div class="header-placeholder"></div>
    </div>

    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef">
      <div v-for="(msg, index) in messages" :key="msg.id" class="message-item"
        :class="{ 'message-self': msg.senderId === currentUserId, 'message-other': msg.senderId !== currentUserId }">
        <!-- 时间分隔线 -->
        <div v-if="shouldShowTime(index)" class="time-divider">
          {{ formatTime(msg.createdAt) }}
        </div>

        <div class="message-content-wrapper">
          <img v-if="msg.senderId !== currentUserId" :src="chatUser.avatar || defaultAvatar" class="msg-avatar"
            @error="handleAvatarError" />
          <img v-else :src="currentUser.avatar || defaultAvatar" class="msg-avatar" @error="handleAvatarError" />

          <div class="message-bubble">
            <div class="message-text" v-html="renderContent(msg.content)"></div>
          </div>
        </div>
      </div>

      <div v-if="messages.length === 0" class="empty-state">
        <SvgIcon name="chat" width="48" height="48" />
        <p>开始聊天吧 ~</p>
      </div>
    </div>

    <!-- 底部输入区域 -->
    <div class="chat-input-area">
      <div class="input-toolbar">
        <button class="toolbar-btn" @click="toggleEmojiPanel">
          <SvgIcon name="emoji" width="24" height="24" />
        </button>
      </div>

      <div class="input-wrapper">
        <ContentEditableInput ref="inputRef" v-model="inputContent" :input-class="'chat-input'"
          placeholder="说点什么..." :enable-ctrl-enter-send="true" @send="handleSend" />
        <button class="send-btn" :disabled="!canSend" @click="handleSend">
          <SvgIcon name="send" width="20" height="20" />
        </button>
      </div>

      <!-- Emoji 面板 -->
      <div v-if="showEmojiPanel" class="emoji-panel-overlay" v-click-outside="closeEmojiPanel">
        <div class="emoji-panel" @click.stop>
          <EmojiPicker @select="handleEmojiSelect" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/api'
import ContentEditableInput from '@/components/ContentEditableInput.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import SvgIcon from '@/components/SvgIcon.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const defaultAvatar = new URL('@/assets/imgs/avatar.png', import.meta.url).href

const chatUserId = ref(route.params.userId)
const chatUser = ref({
  id: null,
  user_id: '',
  nickname: '',
  avatar: ''
})

const currentUser = computed(() => userStore.userInfo || {})
const currentUserId = computed(() => userStore.userInfo?.user_id || '')

const messages = ref([])
const inputContent = ref('')
const inputRef = ref(null)
const messageListRef = ref(null)
const showEmojiPanel = ref(false)

const canSend = computed(() => inputContent.value.trim().length > 0)

// 获取聊天对象的 localStorage key
const getStorageKey = () => {
  const uid = currentUserId.value || 'guest'
  return `chat_messages_${uid}_${chatUserId.value}`
}

// 从 localStorage 加载消息
const loadMessages = () => {
  try {
    const key = getStorageKey()
    const stored = localStorage.getItem(key)
    if (stored) {
      messages.value = JSON.parse(stored)
    }
  } catch (error) {
    console.error('加载聊天记录失败:', error)
  }
}

// 保存消息到 localStorage
const saveMessages = () => {
  try {
    const key = getStorageKey()
    localStorage.setItem(key, JSON.stringify(messages.value))
  } catch (error) {
    console.error('保存聊天记录失败:', error)
  }
}

// 获取对方用户信息
const loadChatUser = async () => {
  try {
    const response = await userApi.getUserInfo(chatUserId.value)
    if (response.success) {
      chatUser.value = response.data
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  }
}

// 发送消息
const handleSend = () => {
  const content = inputContent.value.trim()
  if (!content) return

  const newMessage = {
    id: Date.now(),
    senderId: currentUserId.value,
    receiverId: chatUserId.value,
    content: content,
    type: 'text',
    createdAt: new Date().toISOString(),
    isRead: false
  }

  messages.value.push(newMessage)
  saveMessages()
  inputContent.value = ''

  // 滚动到底部
  nextTick(() => {
    scrollToBottom()
  })

  // 自动回复功能已移除
}

// Emoji 选择
const handleEmojiSelect = (emoji) => {
  const emojiChar = emoji.i
  if (inputRef.value && inputRef.value.insertEmoji) {
    inputRef.value.insertEmoji(emojiChar)
  } else {
    inputContent.value += emojiChar
  }
}

const toggleEmojiPanel = () => {
  showEmojiPanel.value = !showEmojiPanel.value
}

const closeEmojiPanel = () => {
  showEmojiPanel.value = false
}

// 滚动到底部
const scrollToBottom = () => {
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}

// 判断是否显示时间分隔线
const shouldShowTime = (index) => {
  if (index === 0) return true
  const current = new Date(messages.value[index].createdAt)
  const prev = new Date(messages.value[index - 1].createdAt)
  return current - prev > 5 * 60 * 1000 // 超过5分钟显示时间
}

// 格式化时间
const formatTime = (timeStr) => {
  const date = new Date(timeStr)
  const now = new Date()
  const diff = now - date

  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`

  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')

  if (date.toDateString() === now.toDateString()) {
    return `${hours}:${minutes}`
  }

  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

// 渲染消息内容（处理换行）
const renderContent = (content) => {
  return content.replace(/\n/g, '<br>')
}

// 返回上一页
const goBack = () => {
  router.back()
}

const handleAvatarError = (event) => {
  event.target.src = defaultAvatar
}

// 监听消息变化，自动滚动
watch(() => messages.value.length, () => {
  nextTick(() => {
    scrollToBottom()
  })
})

onMounted(() => {
  loadChatUser()
  loadMessages()
  scrollToBottom()
})
</script>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-color-primary);
  padding-top: 72px;
}

/* 顶部导航栏 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--bg-color-primary);
  border-bottom: 1px solid var(--border-color-primary);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 48px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--text-color-primary);
  cursor: pointer;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.back-btn:hover {
  background: var(--bg-color-secondary);
}

.chat-user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}

.chat-nickname {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.header-placeholder {
  width: 40px;
}

/* 消息列表 */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.message-item {
  display: flex;
  flex-direction: column;
}

.message-content-wrapper {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: 80%;
}

.message-self .message-content-wrapper {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.message-other .message-content-wrapper {
  align-self: flex-start;
}

.msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.message-bubble {
  padding: 10px 14px;
  border-radius: 16px;
  word-break: break-word;
  line-height: 1.5;
}

.message-self .message-bubble {
  background: var(--primary-color);
  color: white;
  border-bottom-right-radius: 4px;
}

.message-other .message-bubble {
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
  border-bottom-left-radius: 4px;
}

.message-text {
  font-size: 14px;
}

/* 时间分隔线 */
.time-divider {
  text-align: center;
  color: var(--text-color-quaternary);
  font-size: 12px;
  padding: 8px 0;
  margin: 4px 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--text-color-quaternary);
  gap: 12px;
}

.empty-state p {
  font-size: 14px;
}

/* 底部输入区域 */
.chat-input-area {
  background: var(--bg-color-primary);
  border-top: 1px solid var(--border-color-primary);
  padding: 8px 16px;
  position: relative;
}

.input-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.toolbar-btn:hover {
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

:deep(.chat-input) {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 10px 14px;
  border: 1px solid var(--border-color-primary);
  border-radius: 20px;
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
  font-size: 14px;
  line-height: 1.5;
  overflow-y: auto;
  outline: none;
  word-break: break-word;
}

:deep(.chat-input:focus) {
  border-color: var(--primary-color);
}

:deep(.chat-input:empty:before) {
  content: attr(placeholder);
  color: var(--text-color-quaternary);
  pointer-events: none;
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  background: var(--primary-color);
  color: white;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-color-dark);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Emoji 面板 */
.emoji-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.emoji-panel {
  background: var(--bg-color-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  position: absolute;
  bottom: 80px;
  left: 16px;
}

/* 响应式 */
@media (min-width: 901px) {
  .chat-page {
    max-width: 700px;
    margin: 0 auto;
  }

  .chat-header {
    max-width: 700px;
    margin: 0 auto;
  }
}
</style>