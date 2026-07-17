import { useState } from 'react';
import { motion } from 'framer-motion';
import { HiArrowLeft, HiTrendingUp, HiSwitchHorizontal, HiGlobeAlt } from 'react-icons/hi';

const smartFeatures = [
  {
    icon: <HiTrendingUp size={20} />,
    title: 'تحليل السيناريوهات',
    description: 'نعرض لك السيناريو المتوقع والأسوأ عبر خط زمني تفاعلي يوضح أثر التمويل على وضعك المالي سنة بسنة',
  },
  {
    icon: <HiSwitchHorizontal size={20} />,
    title: 'ربط بالتضخم',
    description: 'نربط بياناتك بمعدلات التضخم والمتغيرات الاقتصادية المستقبلية لتقديم توقعات واقعية ودقيقة',
  },
  {
    icon: <HiGlobeAlt size={20} />,
    title: 'توصيات ذكية',
    description: 'بناءً على تحليل عميق لبياناتك المالية، نقدم توصيات مخصصة تساعدك على بناء قرارات آمنة',
  },
];

const SmartFeatures = () => {
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <section className="smart-features section" id="services">
      <div className="smart-features__container container">
        <div className="smart-features__content">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className="section-label">
              <span className="label-icon">✦</span>
              <span>المزايا الذكية</span>
            </div>
          </motion.div>

          <motion.h2
            className="section-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            افهم مستقبلك المالي
          </motion.h2>

          <motion.p
            className="section-subtitle"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            دليلك الاستباقي لتحليل أثر قرارات التمويل على وضعك المالي بثقة وشفافية
          </motion.p>

          <div className="smart-features__list">
            {smartFeatures.map((feature, index) => (
              <motion.div
                key={index}
                className={`smart-features__item ${activeFeature === index ? 'smart-features__item--active' : ''}`}
                onClick={() => setActiveFeature(index)}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
              >
                <div className="smart-features__item-icon">
                  {feature.icon}
                </div>
                <div className="smart-features__item-content">
                  <h3 className="smart-features__item-title">{feature.title}</h3>
                  {activeFeature === index && (
                    <motion.p
                      className="smart-features__item-desc"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                    >
                      {feature.description}
                    </motion.p>
                  )}
                </div>
                <div className="smart-features__item-arrow">
                  <HiArrowLeft size={20} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="smart-features__phones"
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          {/* Organic Blob & Wireframe Background */}
          <div className="sf-blob-container">
            <div className="sf-blob sf-blob-1"></div>
            <div className="sf-blob sf-blob-2"></div>
            <svg className="sf-wireframe" viewBox="0 0 500 500" preserveAspectRatio="xMidYMid slice">
              <path d="M 0,250 C 150,100 350,400 500,250" />
              <path d="M 0,350 C 200,200 300,500 500,350" />
            </svg>
          </div>

          {/* Phone 1 - Dashboard */}
          <div className="smart-features__phone smart-features__phone--front">
            <div className="smart-features__phone-frame">
              <div className="smart-features__phone-notch" />
              <div className="smart-features__phone-screen">
                {/* Credit Balance Card */}
                <div className="sf-app__balance-card">
                  <div className="sf-app__balance-label">الرصيد المالي</div>
                  <div className="sf-app__balance-amount">25,215 <span>ر.س</span></div>
                  <svg className="sf-app__balance-wave" viewBox="0 0 200 40">
                    <path d="M0,30 Q30,10 60,25 T120,15 T200,20" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none"/>
                  </svg>
                </div>

                {/* Transactions */}
                <div className="sf-app__label">آخر المعاملات</div>
                <div className="sf-app__transactions">
                  <div className="sf-app__tx">
                    <div className="sf-app__tx-icon sf-app__tx-icon--bill">🏦</div>
                    <div className="sf-app__tx-info">
                      <span className="sf-app__tx-name">قسط التمويل</span>
                      <span className="sf-app__tx-date">اليوم، 10:38</span>
                    </div>
                    <span className="sf-app__tx-amount sf-app__tx-amount--debit">-1,154.50</span>
                  </div>
                  <div className="sf-app__tx">
                    <div className="sf-app__tx-icon sf-app__tx-icon--car">🚗</div>
                    <div className="sf-app__tx-info">
                      <span className="sf-app__tx-name">تأمين السيارة</span>
                      <span className="sf-app__tx-date">23 يناير</span>
                    </div>
                    <span className="sf-app__tx-amount sf-app__tx-amount--debit">-540.30</span>
                  </div>
                  <div className="sf-app__tx">
                    <div className="sf-app__tx-icon sf-app__tx-icon--edu">📚</div>
                    <div className="sf-app__tx-info">
                      <span className="sf-app__tx-name">رسوم دراسية</span>
                      <span className="sf-app__tx-date">21 يناير</span>
                    </div>
                    <span className="sf-app__tx-amount sf-app__tx-amount--debit">-2,070.00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Phone 2 - Analytics */}
          <div className="smart-features__phone smart-features__phone--back">
            <div className="smart-features__phone-frame">
              <div className="smart-features__phone-notch" />
              <div className="smart-features__phone-screen">
                <div className="sf-app__label">نظرة عامة</div>
                <div className="sf-app__overview-amount">682.5 <span>ر.س</span></div>

                {/* Bar chart */}
                <div className="sf-app__bar-chart">
                  <div className="sf-app__bar-row">
                    <span className="sf-app__bar-label">10ك</span>
                    <div className="sf-app__bar-track">
                      <div className="sf-app__bar-fill" style={{width: '80%'}} />
                    </div>
                  </div>
                  <div className="sf-app__bar-row">
                    <span className="sf-app__bar-label">8ك</span>
                    <div className="sf-app__bar-track">
                      <div className="sf-app__bar-fill" style={{width: '55%'}} />
                    </div>
                  </div>
                  <div className="sf-app__bar-row">
                    <span className="sf-app__bar-label">6ك</span>
                    <div className="sf-app__bar-track">
                      <div className="sf-app__bar-fill" style={{width: '65%'}} />
                    </div>
                  </div>
                  <div className="sf-app__bar-row">
                    <span className="sf-app__bar-label">4ك</span>
                    <div className="sf-app__bar-track">
                      <div className="sf-app__bar-fill" style={{width: '40%'}} />
                    </div>
                  </div>
                </div>

                {/* Mini chart line */}
                <div className="sf-app__mini-chart">
                  <svg viewBox="0 0 200 50" width="100%">
                    <path d="M0,40 Q30,25 60,35 T120,15 T200,20" stroke="#52B788" strokeWidth="2" fill="none"/>
                    <path d="M0,40 Q30,25 60,35 T120,15 T200,20 V50 H0 Z" fill="rgba(82,183,136,0.1)"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default SmartFeatures;
