<template>
  <div v-if="visible" class="modal-overlay" v-click-outside.mousedown="handleClose" v-escape-key="handleClose">
    <div class="modal-container" @click.stop>
      <div class="modal-header">
        <h3 class="modal-title">{{ currentView === 'menu' ? '设置' : '隐私设置' }}</h3>
        <button v-if="currentView === 'privacy'" class="back-btn" @click="currentView = 'menu'">
          <SvgIcon name="back" width="18" height="18" />
        </button>
        <button class="close-btn" @click="handleClose">
          <SvgIcon name="close" width="20" height="20" />
        </button>
      </div>

      <div v-if="currentView === 'menu'" class="modal-content">
        <div class="settings-item" @click="openPrivacy">
          <div class="item-content">
            <div class="item-title">隐私设置</div>
            <div class="item-desc">管理谁可以查看你的关注与粉丝列表</div>
          </div>
          <SvgIcon name="more" width="18" height="18" />
        </div>

        <div class="settings-item" @click="openAccountSecurity">
          <div class="item-content">
            <div class="item-title">账号与安全</div>
            <div class="item-desc">密码、认证与账号管理</div>
          </div>
          <SvgIcon name="more" width="18" height="18" />
        </div>
      </div>

      <div v-else class="modal-content">
        <div class="privacy-card">
          <div>
            <div class="item-title">公开关注与粉丝列表</div>
            <div class="item-desc">关闭后，其他用户点击你的关注或粉丝时会看到提示</div>
          </div>

          <button
            class="switch-btn"
            :class="{ active: followListPublic }"
            :disabled="saving"
            @click="toggleFollowListPrivacy"
          >
            <span class="switch-thumb"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useScrollLock } from '@/composables/useScrollLock'
import { useUserStore } from '@/stores/user'
import { useAccountSecurityStore } from '@/stores/accountSecurity'
import { userApi } from '@/api'
import SvgIcon from '@/components/SvgIcon.vue'
import messageManager from '@/utils/messageManager'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:visible', 'close'])

const { lock, unlock } = useScrollLock()
const userStore = useUserStore()
const accountSecurityStore = useAccountSecurityStore()

const currentView = ref('menu')
const saving = ref(false)
const followListPublic = ref(true)

const syncFromUser = () => {
  followListPublic.value = Number(userStore.userInfo?.follow_list_public ?? 1) === 1
}

const handleClose = () => {
  currentView.value = 'menu'
  emit('update:visible', false)
  emit('close')
}

const openPrivacy = () => {
  currentView.value = 'privacy'
  syncFromUser()
}

const openAccountSecurity = () => {
  handleClose()
  accountSecurityStore.openAccountSecurityModal()
}

const toggleFollowListPrivacy = async () => {
  if (!userStore.userInfo?.user_id || saving.value) return

  const nextValue = !followListPublic.value
  saving.value = true

  try {
    const response = await userApi.updateUserInfo(userStore.userInfo.user_id, {
      nickname: userStore.userInfo.nickname,
      follow_list_public: nextValue
    })

    if (!response.success) {
      throw new Error(response.message || '保存失败')
    }

    followListPublic.value = nextValue
    userStore.updateUserInfo({
      follow_list_public: nextValue ? 1 : 0
    })
    messageManager.success('隐私设置已更新')
  } catch (error) {
    console.error('更新隐私设置失败:', error)
    messageManager.error(error.message || '更新失败，请稍后重试')
  } finally {
    saving.value = false
  }
}

watch(() => props.visible, (newVisible) => {
  if (newVisible) {
    currentView.value = 'menu'
    syncFromUser()
    lock()
  } else {
    unlock()
  }
}, { immediate: true })
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.21);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-container {
  width: min(92vw, 420px);
  background: var(--bg-color-primary);
  border: 1px solid var(--border-color-primary);
  border-radius: 16px;
  overflow: hidden;
}

.modal-header {
  position: relative;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color-primary);
}

.modal-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  color: var(--text-color-primary);
}

.back-btn,
.close-btn {
  position: absolute;
  top: 14px;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--bg-color-secondary);
  color: var(--text-color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.back-btn {
  left: 16px;
}

.close-btn {
  right: 16px;
}

.modal-content {
  padding: 20px;
}

.settings-item,
.privacy-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid var(--border-color-primary);
  border-radius: 12px;
  background: var(--bg-color-primary);
}

.settings-item + .settings-item {
  margin-top: 12px;
}

.settings-item {
  cursor: pointer;
}

.item-content {
  flex: 1;
}

.item-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.item-desc {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-color-secondary);
}

.switch-btn {
  width: 52px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: var(--bg-color-tertiary);
  padding: 3px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.switch-btn.active {
  background: var(--primary-color);
}

.switch-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.switch-thumb {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}

.switch-btn.active .switch-thumb {
  transform: translateX(22px);
}
</style>
