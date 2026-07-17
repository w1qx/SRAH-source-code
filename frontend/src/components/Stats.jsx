import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { HiOfficeBuilding, HiUsers, HiEmojiHappy, HiClock } from 'react-icons/hi';

const stats = [
  {
    icon: <HiOfficeBuilding size={28} />,
    value: 15,
    suffix: '+',
    label: 'جهة تمويلية',
    description: 'بنك وشركة تمويل مغطاة',
  },
  {
    icon: <HiUsers size={28} />,
    value: 5000,
    suffix: '+',
    label: 'تحليل مالي',
    description: 'تم إجراؤه عبر المنصة',
  },
  {
    icon: <HiEmojiHappy size={28} />,
    value: 97,
    suffix: '%',
    label: 'دقة التحليل',
    description: 'في توقع السيناريوهات',
  },
  {
    icon: <HiClock size={28} />,
    value: 2,
    suffix: '',
    label: 'دقيقتان',
    description: 'لتحليل وضعك المالي',
  },
];

const AnimatedCounter = ({ value, suffix, inView }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;

    const duration = 2000;
    const steps = 60;
    const stepTime = duration / steps;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setCount(current);
      if (step >= steps) clearInterval(timer);
    }, stepTime);

    return () => clearInterval(timer);
  }, [inView, value]);

  return (
    <span className="stats__value">
      {count.toLocaleString('ar-SA')}{suffix}
    </span>
  );
};

const Stats = () => {
  const [inView, setInView] = useState(false);
  const sectionRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="stats section" ref={sectionRef}>
      <div className="stats__container container">
        <motion.div
          className="stats__header"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="section-title">أرقام تتحدث عنّا</h2>
          <p className="section-subtitle" style={{ margin: '0 auto', textAlign: 'center' }}>
            نفخر بثقة آلاف العملاء وشراكتنا مع أكبر المؤسسات المالية في المملكة
          </p>
        </motion.div>

        <div className="stats__grid">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              className="stats__card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <div className="stats__card-icon">
                {stat.icon}
              </div>
              <AnimatedCounter value={stat.value} suffix={stat.suffix} inView={inView} />
              <span className="stats__label">{stat.label}</span>
              <span className="stats__description">{stat.description}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
