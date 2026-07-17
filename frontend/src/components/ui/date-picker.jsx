import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const CustomDatePicker = ({ isOpen, onClose, onSelect, selectedDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Arabic Months
  const arabicMonths = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  // Year range (typical DOB range)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const startDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const handleYearChange = (e) => {
    setCurrentMonth(new Date(parseInt(e.target.value), currentMonth.getMonth()));
  };

  const handleMonthChange = (e) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), parseInt(e.target.value)));
  };

  const days = [];
  const totalDays = daysInMonth(currentMonth.getFullYear(), currentMonth.getMonth());
  const firstDay = startDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth());

  // Padding for start of month
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="w-10 h-10" />);
  }

  for (let d = 1; d <= totalDays; d++) {
    const isToday = new Date().toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d).toDateString();
    const isSelected = selectedDate && new Date(selectedDate).toDateString() === new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d).toDateString();

    days.push(
      <button
        key={d}
        type="button"
        onClick={() => {
          onSelect(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), d).toISOString().split('T')[0]);
          onClose();
        }}
        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-200
          ${isSelected ? 'bg-[#F1B497] text-white scale-110 shadow-lg' : isToday ? 'border border-[#F1B497] text-black' : 'hover:bg-black/5 text-gray-700'}
        `}
      >
        {d}
      </button>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[100] bg-black/5 backdrop-blur-[2px]"
          />

          {/* Calendar Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            className="absolute top-full mt-4 right-0 z-[101] w-[340px] bg-white rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.12)] overflow-hidden p-6 border border-gray-100"
            dir="rtl"
            style={{
              fontFamily: "'IBM Plex Arabic', sans-serif"
            }}
          >
            {/* TIGHTER HEADER CONTROLS */}
            <div className="flex items-center justify-center gap-2 mb-6 bg-gray-50/50 py-3 px-4 rounded-full">
              <button type="button" onClick={handleNextMonth} className="p-1 hover:bg-white rounded-full transition-all hover:shadow-sm">
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </button>
              
              <div className="flex items-center gap-1 mx-2">
                <select 
                  value={currentMonth.getMonth()} 
                  onChange={handleMonthChange}
                  className="bg-transparent font-bold text-sm text-[#111] border-none focus:ring-0 cursor-pointer appearance-none hover:text-[#F1B497]"
                >
                  {arabicMonths.map((month, idx) => (
                    <option key={month} value={idx}>{month}</option>
                  ))}
                </select>
                <span className="text-gray-300">|</span>
                <select 
                  value={currentMonth.getFullYear()} 
                  onChange={handleYearChange}
                  className="bg-transparent font-bold text-sm text-[#111] border-none focus:ring-0 cursor-pointer appearance-none hover:text-[#F1B497]"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <button type="button" onClick={handlePrevMonth} className="p-1 hover:bg-white rounded-full transition-all hover:shadow-sm">
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Weekdays */}
            <div className="grid grid-cols-7 mb-2">
              {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map((day) => (
                <div key={day} className="text-center text-[10px] font-bold text-gray-400 py-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Days Grid - Perfectly centered */}
            <div className="grid grid-cols-7 gap-1 justify-items-center">
              {days}
            </div>

            {/* Bottom Actions - NOW CENTERED */}
            <div className="mt-6 flex justify-center gap-12 border-t border-gray-100 pt-5">
               <button 
                  type="button"
                  onClick={() => {
                    onSelect('');
                    onClose();
                  }}
                  className="text-xs font-bold text-gray-400 hover:text-red-400 transition-colors"
               >
                  مسح
               </button>
               <button 
                  type="button"
                  onClick={onClose}
                  className="text-xs font-bold text-[#F1B497] hover:text-[#DEA083] transition-colors"
               >
                  إغلاق
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
