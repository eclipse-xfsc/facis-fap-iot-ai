import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import 'primeicons/primeicons.css'
import './styles/variables.css'
import './styles/overrides.css'
import App from './App.vue'
import router from './router'
import { initAuth } from './auth'

// Authenticate BEFORE mounting the app.
// The index.html splash screen stays visible during this time.
// If user has no KC session, KC redirects to login (page unloads — mount never happens).
// If user has KC session, initAuth() resolves and we mount the app with sidebar + user data.
initAuth().then(() => {
  const app = createApp(App)

  app.use(createPinia())
  app.use(router)

  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        prefix: 'p',
        darkModeSelector: false,
        cssLayer: false
      }
    }
  })

  app.use(ToastService)
  app.use(ConfirmationService)
  app.directive('tooltip', Tooltip)

  app.mount('#app')
}).catch((err) => {
  // If KC init fails completely, show error in the splash area
  const el = document.getElementById('app')
  if (el) {
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background:#f8fafc;font-family:Inter,system-ui,sans-serif;">
        <img src="/facis-logo.svg" alt="FACIS" style="width:120px;opacity:0.8;" />
        <p style="margin-top:1.5rem;color:#dc2626;font-size:0.9rem;font-weight:600;">Authentication Failed</p>
        <p style="margin-top:0.5rem;color:#64748b;font-size:0.8rem;max-width:400px;text-align:center;">${err?.message || 'Could not connect to Keycloak. Please refresh the page.'}</p>
        <button onclick="location.reload()" style="margin-top:1rem;padding:0.5rem 1.5rem;background:#005fff;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem;">Retry</button>
      </div>
    `
  }
})
