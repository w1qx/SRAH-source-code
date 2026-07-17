import { motion } from 'framer-motion';
import { HiUser, HiClipboardList, HiAdjustments, HiPaperAirplane } from 'react-icons/hi';

const steps = [
  {
    num: '01',
    icon: <HiUser size={28} />,
    title: 'أدخل بياناتك',
    description: 'قم بتعبئة نموذج بسيط يوضح دخلك الشهري، التزاماتك، ومصروفاتك الحالية لنبدأ بتحليل وضعك المالي.',
  },
  {
    num: '02',
    icon: <HiClipboardList size={28} />,
    title: 'تحليل القرار',
    description: 'نربط بياناتك المالية بمعدلات التضخم والمتغيرات الاقتصادية لنقدم لك قراءة عميقة لأثر التمويل على مستقبلك.',
  },
  {
    num: '03',
    icon: <HiAdjustments size={28} />,
    title: 'استعراض السيناريوهات',
    description: 'عبر خط زمني تفاعلي، نعرض لك السيناريو المتوقع والأسوأ لتتخذ قرارك بثقة وأمان مالي.',
  },
  {
    num: '04',
    icon: <HiPaperAirplane size={28} />,
    title: 'اختر العرض الأنسب',
    description: 'بناءً على تحليلك، نعرض لك العروض التمويلية المناسبة مع توصيات ذكية للخيار الأمثل.',
  },
];

const HowItWorks = () => {
  return (
    <section className="how-it-works section" id="how-it-works">
      <div className="how-it-works__container container">
        <motion.div
          className="how-it-works__header"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-label">
            <span>+ خطوات بسيطة</span>
          </div>
          <h2 className="section-title">كيف تعمل سراة؟</h2>
          <p className="section-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
            أربع خطوات تفصلك عن فهم الأثر الحقيقي لأي قرار تمويلي على وضعك المالي
          </p>
        </motion.div>

        <div className="how-it-works__steps">
          {/* Animated Squiggly Line Threading behind cards */}
          <svg className="how-it-works__squiggle hidden lg:block" preserveAspectRatio="none" viewBox="0 0 1000 100">
            <path d="M -50,50 Q 80,-20 220,50 T 480,50 T 750,50 T 1050,50" />
          </svg>

          {steps.map((step, index) => (
            <motion.div
              key={index}
              className="how-it-works__step"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
            >
              <div className="how-it-works__step-num">{step.num}</div>
              <div className="how-it-works__step-icon-wrap">
                {step.icon}
              </div>
              <h3 className="how-it-works__step-title">{step.title}</h3>
              <p className="how-it-works__step-desc">{step.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
