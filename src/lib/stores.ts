import { writable } from 'svelte/store'
import { capitalize, lowerCase } from 'lodash-es'

type AlertType = 'success' | 'error' | 'info' | null
type AlertData = {
  type: AlertType
  message: string
  timestamp: Date | null
}

function createAlert() {
  const alert = writable<AlertData>({
    type: null,
    message: '',
    timestamp: null,
  })
  function trigger(type: AlertType, message: string, auto = false) {
    if (type === 'error') {
      if (auto) {
        message = `${capitalize(
          lowerCase(message.includes('/') ? message.split('/')[1] : message),
        )}.`
      }
      alert.set({
        type,
        message,
        timestamp: new Date(),
      })
    } else {
      alert.set({
        type,
        message,
        timestamp: new Date(),
      })
    }
  }
  function clear() {
    alert.set({
      type: null,
      message: '',
      timestamp: null,
    })
  }
  return { subscribe: alert.subscribe, trigger, clear }
}

export const alert = createAlert()
