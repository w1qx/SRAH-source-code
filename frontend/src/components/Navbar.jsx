"use client";

import { useState, useEffect, useSyncExternalStore } from 'react';
import { HiOutlineMenuAlt3 } from 'react-icons/hi';
import { IoClose } from 'react-icons/io5';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useConsentStore } from '@/store/useConsentStore';
import { logout } from '@/lib/api/auth';
import { getAccessToken } from '@/lib/api/client';
import { toast } from '@/lib/toast';

import { Logo } from './ui/logo';

/**
 * The advisor journey as the user sees it. The store only counts the three steps that live on
 * /advisor, so the consent screen is step 1 here and the store's step 1..3 maps to 2..4.
 */
const FLOW_STEPS = [
  { num: 1, label: 'إقرارك' },
  { num: 2, label: 'بياناتك' },
  { num: 3, label: 'تحليل القرار' },
  { num: 4, label: 'العروض المناسبة' },
];

/** The session token has no change event; re-renders (every navigation) re-read it. */
const subscribeNever = () => () => {};

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isConsent = pathname === '/consent';
  const isSearching = pathname === '/searching';
  const isAdvisor = pathname === '/advisor';
  const isFlow = isConsent || isSearching || isAdvisor;
  const { currentStep, resetAll } = useAppStore();

  // Whether THIS tab holds a session. The snapshot is re-read on every render, and
  // every login/logout navigates (→ re-render), so the button tracks the session
  // without effect-driven state. Server snapshot is false: no session during SSR.
  const authed = useSyncExternalStore(
    subscribeNever,
    () => Boolean(getAccessToken()),
    () => false,
  );

  const handleLogout = async () => {
    try {
      await logout(); // revokes the session server-side and drops the token
    } catch {
      /* the token is cleared locally even when the API call fails */
    }
    // Account switching must not leak one user's state to the next: wipe the
    // module-level stores that survive SPA navigation.
    resetAll();
    useConsentStore.getState().reset();
    toast.success('تم تسجيل الخروج');
    router.push('/login');
  };

  // /searching is the data pull that opens step 2 — it belongs to بياناتك, same as the questions.
  const activeStep = isConsent ? 1 : isSearching ? 2 : currentStep + 1;
  const activeLabel = FLOW_STEPS[activeStep - 1]?.label ?? '';

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'الرئيسية', href: '/#home' },
    { label: 'عن المنصة', href: '/#features' },
    { label: 'الخدمات', href: '/#services' },
    { label: 'كيف تعمل', href: '/#how-it-works' },
    { label: 'تواصل معنا', href: '/#contact' },
  ];

  return (
    <header className={`navbar-notch ${isScrolled ? 'navbar-notch--scrolled' : ''}`}>
      {/* Curved notch connectors */}
      <div className="notch-connector notch-connector--left" aria-hidden="true" />
      <div className="notch-connector notch-connector--right" aria-hidden="true" />

      <div className="navbar-notch__inner">
        {/* Logo */}
        <Link href="/" className="navbar-notch__logo group">
          <Logo className="hidden md:block w-32 h-20 text-[#082F3E]" />
        </Link>

        {/* Dynamic Navigation Content */}
        {isFlow ? (
          <>
            {/* Steps - Desktop. Not `.nav-list`: that class is display:none below 1024px,
                and these steps carry their own breakpoint. */}
            <nav className="hidden lg:flex navbar-notch__nav">
              <ul className="flex items-center gap-1 list-none m-0 p-0">
                {FLOW_STEPS.map((step, i, arr) => (
                  <li key={step.num} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                          activeStep === step.num
                            ? "bg-navy text-white animate-pulse"
                            : activeStep > step.num
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-border text-text-secondary"
                        }`}
                      >
                        {activeStep > step.num ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          step.num
                        )}
                      </span>
                      <span
                        className={`text-sm whitespace-nowrap ${
                          activeStep === step.num
                            ? "font-bold text-navy"
                            : "text-text-secondary"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="w-6 h-px bg-border/60 mx-2" />
                    )}
                  </li>
                ))}
              </ul>
            </nav>

            {/* Steps - Mobile */}
            <div className="lg:hidden text-sm text-text-secondary font-medium whitespace-nowrap">
              الخطوة {activeStep} من {FLOW_STEPS.length}
              <span className="hidden sm:inline"> · {activeLabel}</span>
            </div>
          </>
        ) : (
          /* Normal Homepage Nav Links */
          <nav className={`navbar-notch__nav ${isMobileOpen ? 'navbar-notch__nav--open' : ''}`}>
            <ul className="nav-list">
              {navLinks.map((link, index) => (
                <li key={index}>
                  <Link
                    href={link.href}
                    className="nav-link"
                    onClick={() => setIsMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Right CTA / Reset Controls */}
        <div className="flex items-center gap-2 lg:gap-4">
          {isAdvisor ? (
            <button
              onClick={resetAll}
              className="navbar-notch__cta cursor-pointer text-xs sm:text-sm font-bold whitespace-nowrap border-0"
            >
              بدء تحليل جديد
            </button>
          ) : isFlow ? (
            /* Nothing to reset before the questions start — the way out is back to the homepage. */
            <Link href="/" className="navbar-notch__cta text-xs sm:text-sm whitespace-nowrap">
              الرئيسية
            </Link>
          ) : (
            <Link href="/login" className="navbar-notch__cta" onClick={() => setIsMobileOpen(false)}>
              ابدأ الآن
            </Link>
          )}

          {/* Without a logout there is no clean way to switch accounts on one device —
              the next person inherits the previous session. */}
          {authed && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-navy transition-colors cursor-pointer whitespace-nowrap"
              aria-label="تسجيل الخروج"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              تسجيل الخروج
            </button>
          )}

          {!isFlow && (
            <button
              className="menu-toggle-notch"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              aria-label="Toggle menu"
            >
              {isMobileOpen ? <IoClose size={24} /> : <HiOutlineMenuAlt3 size={24} />}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
