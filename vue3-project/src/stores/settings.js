import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  const showSettingsModal = ref(false)

  const openSettingsModal = () => {
    showSettingsModal.value = true
  }

  const closeSettingsModal = () => {
    showSettingsModal.value = false
  }

  return {
    showSettingsModal,
    openSettingsModal,
    closeSettingsModal
  }
})
