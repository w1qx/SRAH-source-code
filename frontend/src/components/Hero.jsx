import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const Hero = () => {
  const heroRef = useRef(null);

  return (
    <section className="hero" id="home" ref={heroRef}>
      <div className="hero__landing">
        <div className="hero__title-container">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 2.2, ease: [0.165, 0.84, 0.44, 1] }}
            className="hero__title-wrapper"
          >
            <h1 className="ts-hero-heading hero__title">
              قرارك المالي،<br />
              يبدأ هنا.
            </h1>
            
            <div className="hero__cta">
              <Link href="/login" className="ts-btn ts-btn--fill">
                حلّل وضعك المالي
              </Link>
            </div>
          </motion.div>
        </div>

        <motion.div 
          className="hero__bottom"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.8 }}
        >
          <div className="hero__bottom-col">
            <h3 className="hero__desc-title">وعي مالي قبل كل قرار</h3>
            <p className="hero__desc">
              سراة تحلل بياناتك المالية وتربطها بالمتغيرات الاقتصادية والتضخم، لتمنحك رؤية واضحة للسيناريوهات المحتملة قبل اتخاذ أي قرار تمويلي.
            </p>
          </div>
          <div className="hero__bottom-col hero__bottom-col--right">
            <h2 className="hero__subtitle">
              منصة توعية مالية استباقية لتحليل قرارات التمويل.
            </h2>
            <div className="hero__copyright">سراة ©2026</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Hero;
