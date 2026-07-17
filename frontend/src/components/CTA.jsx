import { motion } from 'framer-motion';
import { HiArrowLeft } from 'react-icons/hi';
import Link from 'next/link';

const CTA = () => {
  return (
    <section className="cta section" id="contact">
      <div className="cta__container container">
        <motion.div
          className="cta__card"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          {/* Background decoration */}
          <div className="cta__bg-circle cta__bg-circle--1" />
          <div className="cta__bg-circle cta__bg-circle--2" />
          <div className="cta__bg-dots" />

          <div className="cta__content">
            <motion.h2
              className="cta__title"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              ابدأ تحليل وضعك المالي الآن
            </motion.h2>

            <motion.p
              className="cta__subtitle"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              اكتشف السيناريوهات المحتملة لأي قرار تمويلي وابنِ قراراتك على بيانات حقيقية ومعطيات اقتصادية دقيقة
            </motion.p>

            <motion.div
              className="cta__form"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <div className="cta__input-wrapper">
                <input
                  type="email"
                  className="cta__input"
                  placeholder="أدخل بريدك الإلكتروني"
                  dir="rtl"
                />
                <Link href="/login" className="ts-btn ts-btn--fill cta__submit" style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center'}}>
                  ابدأ الآن <HiArrowLeft size={18} style={{display:'inline', marginBottom:'-4px', marginRight:'0.5rem'}} />
                </Link>
              </div>
              <p className="cta__disclaimer">
                نحترم خصوصيتك. لن نشارك بريدك مع أي جهة خارجية.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTA;
