<template>
  <div class="chat-page">
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

    <div class="message-list" ref="messageListRef">
      <div v-if="loading" class="empty-state">
        <SvgIcon name="chat" width="48" height="48" />
        <p>正在加载私信...</p>
      </div>

      <div v-else-if="loadError" class="empty-state">
        <SvgIcon name="chat" width="48" height="48" />
        <p>{{ loadError }}</p>
      </div>

      <template v-else>
        <div
          v-for="(msg, index) in messages"
          :key="msg.id"
          class="message-item"
          :class="{ 'message-self': msg.senderId === currentUserAutoId, 'message-other': msg.senderId !== currentUserAutoId }"
        >
          <div v-if="shouldShowTime(index)" class="time-divider">
            {{ formatMessageTime(msg.createdAt) }}
          </div>

          <div class="message-content-wrapper">
            <img
              v-if="msg.senderId !== currentUserAutoId"
              :src="chatUser.avatar || defaultAvatar"
              class="msg-avatar"
              @error="handleAvatarError"
            />
            <img
              v-else
              :src="currentUser.avatar || defaultAvatar"
              class="msg-avatar"
              @error="handleAvatarError"
            />

            <div class="message-bubble">
              <div class="message-text">{{ msg.content }}</div>
            </div>
          </div>
        </div>

        <div v-if="messages.length === 0" class="empty-state">
          <SvgIcon name="chat" width="48" height="48" />
          <p>开始聊天吧 ~</p>
        </div>
      </template>
    </div>

    <div class="chat-input-area">
      <div class="input-toolbar">
        <button class="toolbar-btn" @click="toggleEmojiPanel">
          <SvgIcon name="emoji" width="24" height="24" />
        </button>
      </div>

      <div class="input-wrapper">
        <ContentEditableInput
          ref="inputRef"
          v-model="inputContent"
          :input-class="'chat-input'"
          placeholder="说点什么..."
          :enable-ctrl-enter-send="true"
          @send="handleSend"
        />
        <button class="send-btn" :disabled="!canSend || sending || loading" @click="handleSend">
          <SvgIcon name="send" width="18" height="18" />
          <span>发送</span>
        </button>
      </div>

      <div v-if="showEmojiPanel" class="emoji-panel-overlay" v-click-outside="closeEmojiPanel">
        <div class="emoji-panel" @click.stop>
          <EmojiPicker @select="handleEmojiSelect" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useNotificationStore } from '@/stores/notification'
import { userApi } from '@/api'
import { chatApi } from '@/api/chat'
import ContentEditableInput from '@/components/ContentEditableInput.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import SvgIcon from '@/components/SvgIcon.vue'
import messageManager from '@/utils/messageManager'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const notificationStore = useNotificationStore()

const defaultAvatar = new URL('@/assets/imgs/avatar.png', import.meta.url).href
const TEN_MINUTES = 10 * 60 * 1000
const MESSAGE_POLL_INTERVAL = 5000

const chatUser = ref({
  id: null,
  user_id: '',
  nickname: '',
  avatar: ''
})
const messages = ref([])
const inputContent = ref('')
const inputRef = ref(null)
const messageListRef = ref(null)
const showEmojiPanel = ref(false)
const loading = ref(false)
const sending = ref(false)
const loadError = ref('')
const timeRefreshToken = ref(Date.now())

let timeRefreshTimer = null
let messagePollTimer = null

const currentUser = computed(() => userStore.userInfo || {})
const currentUserAutoId = computed(() => Number(userStore.userInfo?.id || 0))
const chatPublicUserId = computed(() => String(route.params.userId || ''))
const canSend = computed(() => inputContent.value.trim().length > 0 && !!chatUser.value.id)

const normalizeMessage = (message) => ({
  id: message.id,
  senderId: Number(message.sender_id),
  receiverId: Number(message.receiver_id),
  content: message.content || '',
  createdAt: message.created_at,
  isRead: Number(message.is_read) === 1
})

const touchTimeRefreshToken = () => {
  timeRefreshToken.value = Date.now()
}

const formatMessageTime = (timeStr) => {
  void timeRefreshToken.value

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

const shouldShowTime = (index) => {
  if (index === 0) return true

  const currentTime = new Date(messages.value[index].createdAt).getTime()
  const prevTime = new Date(messages.value[index - 1].createdAt).getTime()

  return currentTime - prevTime >= TEN_MINUTES
}

const scrollToBottom = () => {
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}

const isNearBottom = () => {
  if (!messageListRef.value) return true

  const { scrollTop, scrollHeight, clientHeight } = messageListRef.value
  return scrollHeight - scrollTop - clientHeight < 120
}

const handleAvatarError = (event) => {
  event.target.src = defaultAvatar
}

const toggleEmojiPanel = () => {
  showEmojiPanel.value = !showEmojiPanel.value
}

const closeEmojiPanel = () => {
  showEmojiPanel.value = false
}

const handleEmojiSelect = (emoji) => {
  const emojiChar = emoji.i
  if (inputRef.value && inputRef.value.insertEmoji) {
    inputRef.value.insertEmoji(emojiChar)
  } else {
    inputContent.value += emojiChar
  }
}

const loadChatUser = async () => {
  const response = await userApi.getUserInfo(chatPublicUserId.value)

  if (!response.success || !response.data) {
    throw new Error(response.message || '聊天对象不存在')
  }

  chatUser.value = response.data
}

const loadMessages = async (options = {}) => {
  if (!chatUser.value.id) return

  const { silent = false } = options

  const response = await chatApi.getMessages(chatUser.value.id, {
    page: 1,
    limit: 200
  })

  if (!response.success) {
    throw new Error(response.message || '获取聊天记录失败')
  }

  const nextMessages = Array.isArray(response.data?.messages)
    ? response.data.messages.map(normalizeMessage)
    : []

  const previousLastId = messages.value[messages.value.length - 1]?.id
  const nextLastId = nextMessages[nextMessages.length - 1]?.id
  const shouldStickToBottom = !silent || isNearBottom() || previousLastId !== nextLastId

  messages.value = nextMessages

  await notificationStore.fetchUnreadCountByType()
  touchTimeRefreshToken()

  if (shouldStickToBottom) {
    await nextTick()
    scrollToBottom()
  }
}

const initializeChat = async () => {
  if (!userStore.userInfo) {
    userStore.initUserInfo()
  }

  if (!userStore.isLoggedIn) {
    loadError.value = '请先登录后查看私信'
    return
  }

  loading.value = true
  loadError.value = ''
  messages.value = []

  try {
    await loadChatUser()
    await loadMessages()
  } catch (error) {
    console.error('加载私信失败:', error)
    loadError.value = error.message || '加载私信失败'
  } finally {
    loading.value = false
  }
}

const handleSend = async () => {
  const content = inputContent.value.trim()

  if (!content || !chatUser.value.id || sending.value) return

  sending.value = true

  try {
    const response = await chatApi.sendMessage({
      receiver_id: chatUser.value.id,
      content
    })

    if (!response.success || !response.data) {
      throw new Error(response.message || '发送失败')
    }

    messages.value.push(normalizeMessage(response.data))
    inputContent.value = ''
    touchTimeRefreshToken()

    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('发送私信失败:', error)
    messageManager.error(error.message || '发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

const startMessagePolling = () => {
  if (messagePollTimer) {
    window.clearInterval(messagePollTimer)
  }

  messagePollTimer = window.setInterval(async () => {
    if (loading.value || sending.value || !chatUser.value.id) return

    try {
      await loadMessages({ silent: true })
    } catch (error) {
      console.error('轮询私信失败:', error)
    }
  }, MESSAGE_POLL_INTERVAL)
}

const goBack = () => {
  router.back()
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    scrollToBottom()
  }
)

watch(
  () => route.params.userId,
  async (newUserId, oldUserId) => {
    if (newUserId && newUserId !== oldUserId) {
      await initializeChat()
    }
  }
)

onMounted(async () => {
  await initializeChat()
  startMessagePolling()

  timeRefreshTimer = window.setInterval(() => {
    touchTimeRefreshToken()
  }, TEN_MINUTES)
})

onUnmounted(() => {
  if (timeRefreshTimer) {
    window.clearInterval(timeRefreshTimer)
  }
  if (messagePollTimer) {
    window.clearInterval(messagePollTimer)
  }
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

.chat-header {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: 700px;
  height: 60px;
  background: var(--bg-color-primary);
  border-bottom: 1px solid var(--bg-color-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  z-index: 20;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.back-btn,
.toolbar-btn,
.send-btn {
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color-primary);
}
.send-btn span {
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
}

.back-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
}

.chat-user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.chat-avatar,
.msg-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.chat-nickname {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color-primary);
}

.header-placeholder {
  width: 36px;
  flex-shrink: 0;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 76px 16px 20px;
  max-width: 700px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.message-item {
  margin-bottom: 12px;
}

.time-divider {
  width: fit-content;
  margin: 0 auto 12px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--bg-color-secondary);
  color: var(--text-color-tertiary);
  font-size: 12px;
}

.message-content-wrapper {
  display: flex;
  gap: 10px;
  align-items: flex-end;
}

.message-self .message-content-wrapper {
  flex-direction: row-reverse;
}

.message-bubble {
  max-width: min(72%, 460px);
  padding: 10px 14px;
  border-radius: 18px;
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
}

.message-self .message-bubble {
  background: var(--primary-color);
  color: #fff;
}

.message-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: 14px;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-color-tertiary);
}

.chat-input-area {
  position: sticky;
  bottom: 0;
  background: var(--bg-color-primary);
  border-top: 1px solid var(--bg-color-secondary);
  padding: 10px 16px 14px;
  z-index: 10;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.input-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 700px;
  margin: 0 auto 8px;
}

.input-wrapper {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

:deep(.chat-input) {
  min-height: 22px;
  max-height: 120px;
  overflow-y: auto;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--bg-color-secondary);
}

.send-btn {
  min-width: 72px;
  height: 40px;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  flex-shrink: 0;
  align-self: center;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  line-height: 1;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.emoji-panel-overlay {
  position: absolute;
  right: 16px;
  bottom: 74px;
  z-index: 30;
}

.emoji-panel {
  background: var(--bg-color-primary);
  border: 1px solid var(--bg-color-secondary);
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

@media (max-width: 768px) {
  .chat-header {
    top: 0;
    max-width: none;
  }

  .chat-page {
    padding-top: 60px;
  }

  .message-list {
    padding-top: 72px;
  }
}
</style>
