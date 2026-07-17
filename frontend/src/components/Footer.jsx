import { FaXTwitter, FaLinkedinIn, FaInstagram } from 'react-icons/fa6';
import { Logo } from './ui/logo';
import Link from 'next/link';

const Footer = () => {
  const quickLinks = [
    { label: 'الرئيسية', href: '/#home' },
    { label: 'عن المنصة', href: '/#features' },
    { label: 'كيف تعمل', href: '/#how-it-works' },
    { label: 'الأسئلة الشائعة', href: '#' },
  ];

  const services = [
    { label: 'تحليل الوضع المالي', href: '#' },
    { label: 'سيناريوهات التمويل', href: '#' },
    { label: 'ربط بمعدلات التضخم', href: '#' },
    { label: 'توصيات ذكية', href: '#' },
  ];

  const legal = [
    { label: 'سياسة الخصوصية', href: '#' },
    { label: 'الشروط والأحكام', href: '#' },
    { label: 'سياسة الاستخدام', href: '#' },
  ];

  return (
    <footer className="footer">
      <div className="footer__container container">
        <div className="footer__grid">
          {/* Brand */}
          <div className="footer__brand">
            <div className="footer__logo">
              <Logo className="w-40 h-auto text-[#fff9f2]" />
            </div>
            <p className="footer__brand-desc" style={{marginTop: '1rem'}}>
              منصة توعية مالية استباقية تحلل بياناتك المالية وتربطها بالمتغيرات الاقتصادية لتمكينك من اتخاذ قرارات مالية مبنية على الثقة.
            </p>
            <div className="footer__social">
              <a href="#" className="footer__social-link" aria-label="Twitter">
                <FaXTwitter size={18} />
              </a>
              <a href="#" className="footer__social-link" aria-label="LinkedIn">
                <FaLinkedinIn size={18} />
              </a>
              <a href="#" className="footer__social-link" aria-label="Instagram">
                <FaInstagram size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="footer__col">
            <h4 className="footer__col-title">روابط سريعة</h4>
            <ul className="footer__list">
              {quickLinks.map((link, i) => (
                <li key={i}>
                  <Link href={link.href} className="footer__link">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div className="footer__col">
            <h4 className="footer__col-title">الخدمات</h4>
            <ul className="footer__list">
              {services.map((link, i) => (
                <li key={i}>
                  <a href={link.href} className="footer__link">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div className="footer__col">
            <h4 className="footer__col-title">قانوني</h4>
            <ul className="footer__list">
              {legal.map((link, i) => (
                <li key={i}>
                  <a href={link.href} className="footer__link">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer__bottom">
          <p className="footer__copyright">
            © {new Date().getFullYear()} سراة. جميع الحقوق محفوظة.
          </p>
          <p className="footer__sama">
            منصة توعوية مالية — ليست جهة تمويلية
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
