import { motion } from 'framer-motion';

const banks = [
  { name: 'البنك الأهلي', abbr: 'الأهلي' },
  { name: 'بنك الراجحي', abbr: 'الراجحي' },
  { name: 'بنك الرياض', abbr: 'الرياض' },
  { name: 'البنك السعودي الفرنسي', abbr: 'الفرنسي' },
  { name: 'بنك البلاد', abbr: 'البلاد' },
  { name: 'بنك الجزيرة', abbr: 'الجزيرة' },
  { name: 'بنك ساب', abbr: 'ساب' },
  { name: 'البنك العربي', abbr: 'العربي' },
  { name: 'شركة عبد اللطيف جميل', abbr: 'ALJ' },
  { name: 'شركة تسهيل', abbr: 'تسهيل' },
  { name: 'شركة نايفات', abbr: 'نايفات' },
  { name: 'شركة أملاك', abbr: 'أملاك' },
];

const Banks = () => {
  const doubledBanks = [...banks, ...banks];

  return (
    <section className="banks section">
      <div className="banks__container container">
        <motion.div
          className="banks__header"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="section-label" style={{ margin: '0 auto var(--space-6)' }}>
            <span className="label-icon">✦</span>
            <span>مصادر البيانات</span>
          </div>
          <h2 className="section-title">نغطي أبرز الجهات التمويلية في المملكة</h2>
        </motion.div>

        <div className="banks__carousel-wrapper">
          <div className="banks__carousel-fade banks__carousel-fade--right" />
          <div className="banks__carousel-fade banks__carousel-fade--left" />
          <div className="banks__carousel">
            {doubledBanks.map((bank, index) => (
              <div key={index} className="banks__logo-card">
                <div className="banks__logo-abbr">{bank.abbr}</div>
                <span className="banks__logo-name">{bank.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Banks;
