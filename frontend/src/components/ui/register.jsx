import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowRight, Calendar, Phone, AlertCircle } from 'lucide-react';
import { Logo } from './logo';
import { Input } from './input';
import { CustomDatePicker } from './date-picker';

// --- ICONS ---

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

const AppleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.52-3.23 0-1.44.62-2.2.44-3.06-.4C3.79 16.18 4.36 9.95 8.81 9.7c1.27.06 2.15.72 2.91.76.97-.2 1.89-.89 2.94-.81 1.25.1 2.19.59 2.81 1.52-2.56 1.54-1.95 4.92.59 5.87-.48 1.26-.7 1.83-1.35 2.95l-.66.29zM12.03 9.64c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

// --- COMPONENT ---

export const RegisterPage = ({
  title = "إنشاء حساب الجديد",
  description = "انضم إلينا وابدأ رحلتك المالية اليوم",
  onRegister,
  onGoogleRegister,
  onAppleRegister,
  onLoginClick,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [formData, setFormData] = useState({
    phone: '',
    email: '',
    dob: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch((err) => {
        console.log("Autoplay failed, trying again...", err);
      });
    }
  }, []);

  // --- Handlers ---
  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, '');
    if (value.length <= 10) {
      setFormData({ ...formData, phone: value });
      if (value.length > 0 && !value.startsWith('05')) {
        setErrors({ ...errors, phone: 'يجب أن يبدأ بـ 05' });
      } else {
        setErrors({ ...errors, phone: null });
      }
    }
  };

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setFormData({ ...formData, email: value });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (value.length > 0 && !emailRegex.test(value)) {
      setErrors({ ...errors, email: 'بريد إلكتروني غير صالح' });
    } else {
      setErrors({ ...errors, email: null });
    }
  };

  const handleDateSelect = (date) => {
    setFormData({ ...formData, dob: date });
    setIsDatePickerOpen(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.phone.startsWith('05') || formData.phone.length !== 10) {
      setErrors({ ...errors, phone: 'أدخل رقم جوال سعودي صحيح' });
      return;
    }
    if (!formData.email.includes('@')) {
      setErrors({ ...errors, email: 'أدخل بريد إلكتروني صحيح' });
      return;
    }
    onRegister?.(formData);
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 md:p-8"
      dir="rtl"
      style={{
        background: 'linear-gradient(145deg, #EDE7E0 0%, #E8DDD5 50%, #DDD3C9 100%)',
        fontFamily: "'IBM Plex Arabic', sans-serif",
      }}
    >
      {/* Outer rounded card */}
      <div className="w-full max-w-[1280px] min-h-[90vh] flex flex-col md:flex-row bg-white overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.08)]" style={{ borderRadius: '2.5rem' }}>

        {/* ===== FORM PANEL ===== */}
        <section
          className="flex-1 flex flex-col items-center justify-center py-10 px-6 md:px-12 lg:px-16 relative"
          style={{
            background: 'linear-gradient(180deg, #F5EFEB 0%, #EDE7E0 100%)',
          }}
        >
          {/* Back Button */}
          <a
            href="/"
            className="absolute top-8 right-8 p-3 rounded-full bg-white/50 hover:bg-white shadow-sm transition-all duration-300 group z-10"
          >
            <ArrowRight className="w-5 h-5 text-[#111] group-hover:translate-x-0.5 transition-transform" />
          </a>

          <div className="w-full max-w-[420px]">
            {/* Brand Logo */}
            <div className="flex justify-center mb-8">
              <Logo className="w-28 h-auto text-[#111]" />
            </div>

            {/* Heading */}
            <div className="text-center" style={{ marginBottom: '40px' }}>
              <h1
                className="text-3xl font-bold tracking-tight mb-3"
                style={{ color: '#111' }}
              >
                {title}
              </h1>
              <p className="text-sm" style={{ color: '#888' }}>
                {description}
              </p>
            </div>

            {/* Form fields */}
            <form className="flex flex-col gap-6 mb-8" onSubmit={handleSubmit}>
              
              {/* Phone Number (Saudi) */}
              <div>
                <div className="flex justify-between items-center mb-4 pr-8">
                  <label className="text-sm font-semibold" style={{ color: '#666' }}>
                    رقم الجوال
                  </label>
                  {errors.phone && (
                    <span className="text-[11px] text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.phone}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handlePhoneChange}
                    placeholder="05x xxx xxxx"
                    className={`h-[60px] pl-6 text-base border-none shadow-sm text-right transition-all ${errors.phone ? 'ring-1 ring-red-400' : ''}`}
                    style={{ background: '#FFF', borderRadius: '99px', paddingRight: '48px' }}
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2 text-gray-400">
                    <Phone className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Email */}
              <div>
                <div className="flex justify-between items-center mb-4 pr-8">
                  <label className="text-sm font-semibold" style={{ color: '#666' }}>
                    البريد الإلكتروني
                  </label>
                  {errors.email && (
                    <span className="text-[11px] text-red-500 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {errors.email}
                    </span>
                  )}
                </div>
                <Input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleEmailChange}
                  placeholder="name@example.com"
                  className={`h-[60px] pl-6 text-base border-none shadow-sm text-right transition-all ${errors.email ? 'ring-1 ring-red-400' : ''}`}
                  style={{ background: '#FFF', borderRadius: '99px', paddingRight: '48px' }}
                />
              </div>

              {/* Date of Birth — Branded Implementation */}
              <div>
                <label className="text-sm font-semibold block mb-4 pr-8" style={{ color: '#666' }}>
                  تاريخ الميلاد
                </label>
                <div className="relative">
                  {/* Visible Text Field */}
                  <div onClick={() => setIsDatePickerOpen(!isDatePickerOpen)} className="cursor-pointer">
                    <Input
                      type="text"
                      readOnly
                      value={formData.dob ? new Date(formData.dob).toLocaleDateString('ar-EG') : ''}
                      placeholder="يوم / شهر / سنة"
                      className="h-[60px] pl-6 text-base border-none shadow-sm text-right cursor-pointer pointer-events-none"
                      style={{ background: '#FFF', borderRadius: '99px', paddingRight: '48px' }}
                    />
                  </div>
                  {/* Icon */}
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Calendar className="w-4 h-4" />
                  </div>
                  
                  {/* Custom Date Picker Component */}
                  <CustomDatePicker 
                    isOpen={isDatePickerOpen}
                    onClose={() => setIsDatePickerOpen(false)}
                    onSelect={handleDateSelect}
                    selectedDate={formData.dob}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-sm font-semibold block mb-4 pr-8" style={{ color: '#666' }}>
                  كلمة المرور
                </label>
                <div className="relative">
                  <Input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder="••••••••"
                    className="h-[60px] pl-16 text-base border-none shadow-sm text-right"
                    style={{ background: '#FFF', borderRadius: '99px', paddingRight: '48px' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 left-6 flex items-center hover:opacity-75 transition-opacity"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5 text-gray-400" /> : <Eye className="w-5 h-5 text-gray-400" />}
                  </button>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                className="w-full h-[60px] mt-4 text-lg font-bold transition-all duration-300 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98] cursor-pointer"
                style={{ background: '#111', color: '#F5EFEB', borderRadius: '99px' }}
              >
                إنشاء الحساب
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-6 mb-6">
              <span className="flex-1 h-[1.5px] bg-black/5" />
              <span className="text-xs font-medium text-gray-400">أو التسجيل عبر</span>
              <span className="flex-1 h-[1.5px] bg-black/5" />
            </div>

            {/* Social Buttons */}
            <div className="flex gap-4 mb-8">
              <button
                type="button"
                onClick={onAppleRegister}
                className="flex-1 flex items-center justify-center gap-1.5 h-[56px] text-sm font-semibold bg-white border border-gray-100 rounded-full hover:shadow-md transition-all active:scale-[0.98]"
              >
                <AppleIcon />
                Apple
              </button>
              <button
                type="button"
                onClick={onGoogleRegister}
                className="flex-1 flex items-center justify-center gap-1.5 h-[56px] text-sm font-semibold bg-white border border-gray-100 rounded-full hover:shadow-md transition-all active:scale-[0.98]"
              >
                <GoogleIcon />
                Google
              </button>
            </div>

            {/* Footer */}
            <div className="text-center text-sm" style={{ color: '#777' }}>
              لديك حساب بالفعل؟{' '}
              <a
                href="#login"
                className="font-bold text-[#111] underline"
                onClick={(e) => { e.preventDefault(); onLoginClick?.(); }}
              >
                تسجيل الدخول
              </a>
            </div>
          </div>
        </section>

        {/* ===== HERO PANEL ===== */}
        <section className="hidden md:block flex-1 relative overflow-hidden bg-[#F5EFEB]">
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/sarat2.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/10" />
        </section>
      </div>
    </div>
  );
};
