import { toast as sonnerToast } from "sonner";

/**
 * Global toast helper that uses the custom sonner instance.
 * This can be imported anywhere in the app without needing a ref.
 */
export const toast = {
  success: (title, message) => {
    // We emit an event that our Toaster component in App.jsx listens for
    window.dispatchEvent(new CustomEvent('app-toast', { 
      detail: { title, message, variant: 'success' } 
    }));
  },
  error: (title, message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { 
      detail: { title, message, variant: 'error' } 
    }));
  },
  info: (title, message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { 
      detail: { title, message, variant: 'default' } 
    }));
  },
  warning: (title, message) => {
    window.dispatchEvent(new CustomEvent('app-toast', { 
      detail: { title, message, variant: 'warning' } 
    }));
  }
};
