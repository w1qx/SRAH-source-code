'use client'

import React, { forwardRef, useImperativeHandle } from 'react';
import { motion } from 'framer-motion';
import {
  Toaster as SonnerToaster,
  toast as sonnerToast,
} from 'sonner';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  AlertTriangle,
  X,
} from 'lucide-react';

import { cn } from '../../lib/utils';

type Variant = 'default' | 'success' | 'error' | 'warning';
type Position =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

interface ToasterProps {
  title?: string;
  message: string;
  variant?: Variant;
  duration?: number;
  position?: Position;
}

export interface ToasterRef {
  show: (props: ToasterProps) => void;
}

const variantStyles: Record<Variant, { bg: string, accent: string, icon: any }> = {
  default: { bg: 'bg-white/95', accent: 'bg-[#111]', icon: Info },
  success: { bg: 'bg-white/95', accent: 'bg-green-500', icon: CheckCircle2 },
  error: { bg: 'bg-white/95', accent: 'bg-red-500', icon: AlertCircle },
  warning: { bg: 'bg-white/95', accent: 'bg-amber-500', icon: AlertTriangle },
};

const Toaster = forwardRef<ToasterRef, { defaultPosition?: Position }>(
  ({ defaultPosition = 'bottom-right' }, ref) => {
    
    const showToast = React.useCallback(({
      title,
      message,
      variant = 'default',
      duration = 5000,
      position = defaultPosition,
    }: ToasterProps) => {
      const config = variantStyles[variant];
      const Icon = config.icon;

      sonnerToast.custom(
        (toastId) => (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            dir="rtl"
            className={cn(
               "flex items-center gap-4 px-6 py-4 rounded-[2.5rem] border border-white/50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.12)] backdrop-blur-2xl ring-1 ring-black/5",
               config.bg
            )}
            style={{ 
              fontFamily: "'IBM Plex Arabic', sans-serif",
              minWidth: '380px'
            }}
          >
            {/* Visual Indicator */}
            <div className={cn("w-1.5 h-10 rounded-full", config.accent)} />
            
            {/* Icon */}
            <div className={cn(
              "p-2 rounded-full flex items-center justify-center",
              variant === 'success' ? 'bg-green-50 text-green-600' :
              variant === 'error' ? 'bg-red-50 text-red-600' :
              variant === 'warning' ? 'bg-amber-50 text-amber-600' :
              'bg-gray-50 text-gray-500'
            )}>
              <Icon className="w-6 h-6" strokeWidth={2.5} />
            </div>

            {/* Content */}
            <div className="flex-1 text-right">
              {title && (
                <div className="text-[16px] font-bold text-[#111] leading-tight mb-0.5">
                  {title}
                </div>
              )}
              <div className="text-[14px] font-medium text-gray-500 leading-snug">
                {message}
              </div>
            </div>

            {/* Close */}
            <button
              onClick={() => sonnerToast.dismiss(toastId)}
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </motion.div>
        ),
        { duration, position }
      );
    }, [defaultPosition]);

    useImperativeHandle(ref, () => ({
      show: showToast
    }));

    React.useEffect(() => {
      const handleEvent = (e: any) => {
        if (e.detail) showToast(e.detail);
      };
      window.addEventListener('app-toast', handleEvent);
      return () => window.removeEventListener('app-toast', handleEvent);
    }, [showToast]);

    return <SonnerToaster position={defaultPosition} expand />;
  }
);

Toaster.displayName = "Toaster";

export default Toaster;
export { sonnerToast as toast };
