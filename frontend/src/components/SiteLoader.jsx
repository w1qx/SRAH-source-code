import { useState, useEffect } from 'react';
import { Logo } from './ui/logo';

const SiteLoader = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isUnmounted, setIsUnmounted] = useState(false);

  useEffect(() => {
    // 1. Loader stays visible for 2 seconds (simulating smooth entry)
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, 2000);

    // 2. completely unmount after transition completes
    const unmountTimer = setTimeout(() => {
      setIsUnmounted(true);
    }, 2800);

    return () => {
      clearTimeout(timer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (isUnmounted) return null;

  return (
    <div className={`site-loader ${isLoaded ? 'is-loaded' : ''}`}>
      <div className="site-loader__heading">
        <div className="site-loader__heading-inner">
          <Logo className="site-loader__svg w-48 h-32" style={{ color: '#2F4F4F' }} />
        </div>
      </div>
      <div className="site-loader__progress"></div>
    </div>
  );
};

export default SiteLoader;
