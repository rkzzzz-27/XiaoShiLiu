import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getChannels, loadChannelsFromAPI, getChannelIdByPath, getChannelPath } from '@/config/channels'
import { getCategoryUnreadStatus, markCategoryAsRead as markCategoryAsReadRequest } from '@/api/categories'
const CHANNEL_POLL_INTERVAL = 60000

export const useChannelStore = defineStore('channel', () => {
  // 频道列表
  const baseChannels = ref(getChannels())
  const isLoading = ref(false)
  const unreadChannelMap = ref({})
  const isUnreadLoading = ref(false)
  const lastUnreadCheckAt = ref(0)
  const pollTimer = ref(null)

  // 当前活跃的频道ID
  const activeChannelId = ref('recommend')

  const channels = computed(() => {
    return baseChannels.value.map(channel => ({
      ...channel,
      hasUnread: Boolean(unreadChannelMap.value[channel.id])
    }))
  })

  // 动态加载频道数据
  const loadChannels = async () => {
    isLoading.value = true
    try {
      await loadChannelsFromAPI()
      baseChannels.value = getChannels()
      await refreshUnreadIndicators()
    } finally {
      isLoading.value = false
    }
  }

  // 设置活跃频道
  const setActiveChannel = (channelId) => {
    activeChannelId.value = channelId
  }

  const resetUnreadIndicators = () => {
    unreadChannelMap.value = {}
    lastUnreadCheckAt.value = 0
  }

  const markCategoryAsRead = async (channelId) => {
    if (!channelId || channelId === 'recommend' || !localStorage.getItem('token')) return

    unreadChannelMap.value = {
      ...unreadChannelMap.value,
      [channelId]: false
    }

    const response = await markCategoryAsReadRequest(channelId)
    if (!response?.success) {
      await refreshUnreadIndicators()
    }
  }

  const refreshUnreadIndicators = async () => {
    if (isUnreadLoading.value) return
    if (!localStorage.getItem('token')) {
      resetUnreadIndicators()
      return
    }

    const currentChannels = getChannels().filter(channel => channel.id !== 'recommend')
    if (currentChannels.length === 0) {
      baseChannels.value = getChannels()
      return
    }

    isUnreadLoading.value = true

    try {
      const response = await getCategoryUnreadStatus()
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error(response?.message || '获取分类未读状态失败')
      }

      const nextUnreadChannelMap = {}
      response.data.forEach(item => {
        nextUnreadChannelMap[item.category_id] = Boolean(item.has_unread)
      })

      unreadChannelMap.value = nextUnreadChannelMap
      baseChannels.value = getChannels()
      lastUnreadCheckAt.value = Date.now()
    } catch (error) {
      console.error('刷新分类未读状态失败:', error)
    } finally {
      isUnreadLoading.value = false
    }
  }

  const startUnreadPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value)
    }

    pollTimer.value = setInterval(() => {
      refreshUnreadIndicators()
    }, CHANNEL_POLL_INTERVAL)
  }

  const stopUnreadPolling = () => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value)
      pollTimer.value = null
    }
  }

  // 根据路径获取频道ID
  const getChannelIdByPathFn = getChannelIdByPath

  // 根据频道ID获取路径
  const getChannelPathFn = getChannelPath

  return {
    channels,
    unreadChannelMap,
    lastUnreadCheckAt,
    activeChannelId,
    isLoading,
    isUnreadLoading,
    setActiveChannel,
    loadChannels,
    refreshUnreadIndicators,
    markCategoryAsRead,
    resetUnreadIndicators,
    startUnreadPolling,
    stopUnreadPolling,
    getChannelIdByPath: getChannelIdByPathFn,
    getChannelPath: getChannelPathFn
  }
})
