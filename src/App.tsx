import React, { useState, useEffect, useRef } from 'react';
import { CalendarClock, Download, ArrowRight, X, Sun, Moon } from 'lucide-react';

interface DayEntry {
  day: number;
  amIn: string;
  amOut: string;
  pmIn: string;
  pmOut: string;
}

const STORAGE_KEY = 'monthly-timesheet-v1';
const STORAGE_KEY_FIRST_DAY = 'monthly-timesheet-first-day-v1';

const shortDays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

const generateDefaultEntries = (daysInMonth: number = 31): DayEntry[] => {
  return Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    amIn: '',
    amOut: '',
    pmIn: '',
    pmOut: '',
  }));
};

function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  if (!timeStr.includes(':')) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function calculateDayMinutes(entry: DayEntry): number {
  let total = 0;
  
  const isTime = (val: string) => val && val.includes(':') && !isNaN(Number(val.split(':')[0]));

  if (isTime(entry.amIn) && isTime(entry.amOut)) {
    const start = timeToMinutes(entry.amIn);
    const end = timeToMinutes(entry.amOut);
    total += end >= start ? (end - start) : ((24 * 60) - start + end);
  }
  
  if (isTime(entry.pmIn) && isTime(entry.pmOut)) {
    const start = timeToMinutes(entry.pmIn);
    const end = timeToMinutes(entry.pmOut);
    total += end >= start ? (end - start) : ((24 * 60) - start + end);
  }
  
  return total;
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

const InputTime = ({ value, onChange, onFocus, isFillTarget }: { value: string, onChange: (v: string) => void, onFocus: () => void, isFillTarget: boolean }) => {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalValue(val);
    onChange(val);
  };

  const handleBlur = () => {
    let formatted = localValue.trim();
    if (!formatted) {
      onChange('');
      return;
    }

    if (/^\d{1,2}$/.test(formatted)) {
      formatted = `${formatted.padStart(2, '0')}:00`;
    } else {
      formatted = formatted.replace(/[.,]/g, ':');
      const match = formatted.match(/^(\d{1,2}):(\d{1,2})$/);
      if (match) {
        formatted = `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
      }
    }

    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(formatted)) {
      setLocalValue(formatted);
      onChange(formatted);
    } else {
      onChange(formatted);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  return (
    <input
      type="text"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onFocus={onFocus}
      maxLength={15}
      className={`w-[110px] px-2 py-1.5 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center text-sm ${
        isFillTarget 
          ? 'bg-blue-800 text-white border-blue-900 placeholder-blue-300 cursor-pointer' 
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 focus:border-blue-500'
      }`}
    />
  );
};

export default function App() {
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return localStorage.getItem('timesheet-current-month') || `${y}-${m}`;
  });

  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [firstDay, setFirstDay] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showEndMonthActions, setShowEndMonthActions] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('timesheet-user-name') || '';
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('timesheet-dark-mode') === 'true';
  });
  const [fillModeState, setFillModeState] = useState<{ day: number, field: keyof Omit<DayEntry, 'day'>, keyword: string } | null>(null);
  const fillModeRef = useRef<{ day: number, field: keyof Omit<DayEntry, 'day'>, keyword: string } | null>(null);
  const fieldsOrder: (keyof Omit<DayEntry, 'day'>)[] = ['amIn', 'amOut', 'pmIn', 'pmOut'];

  useEffect(() => {
    localStorage.setItem('timesheet-dark-mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    localStorage.setItem('timesheet-user-name', userName);
  }, [userName]);

  useEffect(() => {
    localStorage.setItem('timesheet-current-month', currentMonth);
    
    let daysInMonth = 31;
    let autoFirstDay = 1;
    if (currentMonth) {
      const [y, m] = currentMonth.split('-');
      const date = new Date(parseInt(y), parseInt(m), 0);
      daysInMonth = date.getDate();
      const firstDate = new Date(parseInt(y), parseInt(m) - 1, 1);
      autoFirstDay = firstDate.getDay();
    }

    const savedEntries = localStorage.getItem(`${STORAGE_KEY}-${currentMonth}`);
    if (savedEntries) {
      try {
        setEntries(JSON.parse(savedEntries));
      } catch (e) {
        setEntries(generateDefaultEntries(daysInMonth));
      }
    } else {
      setEntries(generateDefaultEntries(daysInMonth));
    }

    const savedFirstDay = localStorage.getItem(`${STORAGE_KEY_FIRST_DAY}-${currentMonth}`);
    if (savedFirstDay) {
      setFirstDay(parseInt(savedFirstDay, 10));
    } else {
      setFirstDay(autoFirstDay);
    }
    setIsLoaded(true);
  }, [currentMonth]);

  useEffect(() => {
    if (isLoaded && entries.length > 0) {
      localStorage.setItem(`${STORAGE_KEY}-${currentMonth}`, JSON.stringify(entries));
    }
  }, [entries, currentMonth, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`${STORAGE_KEY_FIRST_DAY}-${currentMonth}`, firstDay.toString());
    }
  }, [firstDay, currentMonth, isLoaded]);

  const handleInputChange = (day: number, field: keyof Omit<DayEntry, 'day'>, value: string) => {
    const trimmed = value.trim();
    // A word is something that contains letters or other non-time characters, and is not empty
    const isTimePattern = /^[\d.,:;]*$/.test(trimmed);
    
    if (!isTimePattern && trimmed !== '') {
      fillModeRef.current = { day, field, keyword: value }; // Keep original casing if they want
      setFillModeState({ day, field, keyword: value });
    } else {
      if (fillModeRef.current && fillModeRef.current.day === day && fillModeRef.current.field === field) {
        fillModeRef.current = null;
        setFillModeState(null);
      }
    }
    setEntries(prev => prev.map(entry => 
      entry.day === day ? { ...entry, [field]: value } : entry
    ));
  };

  const handleInputFocus = (day: number, field: keyof Omit<DayEntry, 'day'>) => {
    const mode = fillModeRef.current;
    if (mode) {
      const startIndex = (mode.day - 1) * 4 + fieldsOrder.indexOf(mode.field);
      const currentIndex = (day - 1) * 4 + fieldsOrder.indexOf(field);
      
      if (currentIndex > startIndex) {
        setEntries(prev => {
          const newEntries = [...prev];
          for (let i = startIndex; i <= currentIndex; i++) {
            const d = Math.floor(i / 4) + 1;
            const f = fieldsOrder[i % 4];
            const entryIndex = newEntries.findIndex(e => e.day === d);
            if (entryIndex !== -1) {
              newEntries[entryIndex] = { ...newEntries[entryIndex], [f]: mode.keyword };
            }
          }
          return newEntries;
        });
      }
      fillModeRef.current = null;
      setFillModeState(null);
    }
  };

  const isFillTarget = (day: number, field: keyof Omit<DayEntry, 'day'>) => {
    if (!fillModeState) return false;
    const startIndex = (fillModeState.day - 1) * 4 + fieldsOrder.indexOf(fillModeState.field);
    const currentIndex = (day - 1) * 4 + fieldsOrder.indexOf(field);
    return currentIndex > startIndex;
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split('-');
    let nextY = parseInt(y, 10);
    let nextM = parseInt(m, 10) + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY++;
    }
    const nextMonthStr = `${nextY}-${String(nextM).padStart(2, '0')}`;
    setCurrentMonth(nextMonthStr);
    setShowEndMonthActions(false);
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    
    try {
      const [year, month] = currentMonth.split('-');
      const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
      const monthNameStr = monthNames[parseInt(month, 10) - 1];

      let html = `
        <div style="font-family: Arial, sans-serif; padding: 10px; color: #333;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="font-size: 22px; margin: 0 0 5px 0;">Foglio Presenze - ${monthNameStr} ${year}</h1>
            ${userName ? `<h2 style="font-size: 16px; margin: 0; font-weight: normal;">Dipendente: <strong>${userName}</strong></h2>` : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: left;">Giorno</th>
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">Mattina IN</th>
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">Mattina OUT</th>
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">Pomeriggio IN</th>
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: center;">Pomeriggio OUT</th>
                <th style="border: 1px solid #d1d5db; padding: 6px; text-align: right;">Totale</th>
              </tr>
            </thead>
            <tbody>
      `;

      let totalMonthMinutes = 0;

      entries.forEach(entry => {
        const dayTotal = calculateDayMinutes(entry);
        totalMonthMinutes += dayTotal;
        
        const dateObj = new Date(parseInt(year, 10), parseInt(month, 10) - 1, entry.day);
        const dayName = shortDays[dateObj.getDay()];
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        const rowStyle = isWeekend ? 'background-color: #f9fafb;' : '';

        html += `
          <tr style="${rowStyle}">
            <td style="border: 1px solid #d1d5db; padding: 4px 6px;"><strong>${entry.day}</strong> <span style="color: #6b7280; font-size: 11px;">${dayName}</span></td>
            <td style="border: 1px solid #d1d5db; padding: 4px 6px; text-align: center;">${entry.amIn || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 4px 6px; text-align: center;">${entry.amOut || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 4px 6px; text-align: center;">${entry.pmIn || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 4px 6px; text-align: center;">${entry.pmOut || ''}</td>
            <td style="border: 1px solid #d1d5db; padding: 4px 6px; text-align: right; font-weight: bold;">${formatMinutes(dayTotal)}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
          <div style="text-align: right; font-size: 16px;">
            Totale Mensile Lavorato: <strong style="color: #2563eb;">${formatMinutes(totalMonthMinutes)}</strong>
          </div>
        </div>
      `;
      
      const opt = {
        margin:       10,
        filename:     `Foglio_Presenze_${currentMonth}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      // @ts-ignore
      if (window.html2pdf) {
        // @ts-ignore
        await window.html2pdf().set(opt).from(html).save();
      } else {
        throw new Error("html2pdf library not loaded.");
      }
    } catch (e) {
      console.error("Errore durante la generazione del PDF:", e);
      alert("Si è verificato un errore durante la generazione del PDF. Assicurati che la libreria sia caricata correttamente.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const totalMonthlyMinutes = entries.reduce((acc, entry) => acc + calculateDayMinutes(entry), 0);

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8 font-sans text-slate-900" id="timesheet-container">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <CalendarClock size={28} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Foglio Presenze</h1>
              <input 
                type="text" 
                placeholder="Inserisci il tuo nome..." 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                className="mt-1 text-sm bg-transparent border-b border-dashed border-slate-300 hover:border-slate-400 focus:border-blue-500 focus:outline-none px-1 py-0.5 text-slate-600 font-medium w-[250px] sm:w-[300px]"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Toggle dark mode"
              title="Attiva/Disattiva Modalità Scura"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <input 
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-2 sm:px-4 py-2 min-w-[150px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer shadow-sm"
            />
          </div>
        </div>
        
        {/* Table Container */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
             <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-sm">
                    <th className="py-4 px-4 font-semibold text-center w-28">Giorno</th>
                    <th className="py-4 px-4 font-semibold text-center w-40">Entrata Mattino</th>
                    <th className="py-4 px-4 font-semibold text-center w-40">Uscita Mattino</th>
                    <th className="py-4 px-4 font-semibold text-center w-40">Entrata Pomeriggio</th>
                    <th className="py-4 px-4 font-semibold text-center w-40">Uscita Pomeriggio</th>
                    <th className="py-4 px-6 font-semibold text-right text-slate-800 w-32 bg-slate-100/50">Totale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                   {entries.map(entry => {
                     const dayTotal = calculateDayMinutes(entry);
                     const currentDayIndex = (firstDay + entry.day - 1) % 7;
                     const isSunday = currentDayIndex === 0;
                     return (
                       <tr key={entry.day} className={`transition-colors ${isSunday ? 'bg-rose-50/20 hover:bg-rose-50/40' : 'hover:bg-blue-50/30 even:bg-slate-50/50'}`}>
                         <td className="py-2.5 px-4 text-center">
                           <div className="flex items-center justify-start gap-2 w-[72px] mx-auto">
                             <span className={`font-semibold text-right w-5 ${isSunday ? 'text-rose-600' : 'text-slate-500'}`}>{entry.day}</span>
                             {entry.day === 1 ? (
                               <select
                                 value={firstDay}
                                 onChange={(e) => setFirstDay(Number(e.target.value))}
                                 className={`text-xs px-1 py-1 rounded border bg-white focus:outline-none focus:ring-1 cursor-pointer w-[44px] ${isSunday ? 'text-rose-600 border-rose-200 hover:border-rose-300 focus:ring-rose-500' : 'border-slate-200 text-slate-600 hover:border-slate-300 focus:ring-blue-500'}`}
                               >
                                 {shortDays.map((d, i) => (
                                   <option key={i} value={i}>{d}</option>
                                 ))}
                               </select>
                             ) : (
                               <span className={`text-xs font-medium w-[44px] text-left px-1 ${isSunday ? 'text-rose-500' : 'text-slate-400'}`}>
                                 {shortDays[currentDayIndex]}
                               </span>
                             )}
                           </div>
                         </td>
                         <td className="py-2.5 px-4">
                           <div className="flex justify-center">
                             <InputTime 
                               value={entry.amIn} 
                               onChange={(v) => handleInputChange(entry.day, 'amIn', v)} 
                               onFocus={() => handleInputFocus(entry.day, 'amIn')}
                               isFillTarget={isFillTarget(entry.day, 'amIn')}
                             />
                           </div>
                         </td>
                         <td className="py-2.5 px-4">
                           <div className="flex justify-center">
                             <InputTime 
                               value={entry.amOut} 
                               onChange={(v) => handleInputChange(entry.day, 'amOut', v)} 
                               onFocus={() => handleInputFocus(entry.day, 'amOut')}
                               isFillTarget={isFillTarget(entry.day, 'amOut')}
                             />
                           </div>
                         </td>
                         <td className="py-2.5 px-4">
                           <div className="flex justify-center">
                             <InputTime 
                               value={entry.pmIn} 
                               onChange={(v) => handleInputChange(entry.day, 'pmIn', v)} 
                               onFocus={() => handleInputFocus(entry.day, 'pmIn')}
                               isFillTarget={isFillTarget(entry.day, 'pmIn')}
                             />
                           </div>
                         </td>
                         <td className="py-2.5 px-4">
                           <div className="flex justify-center">
                             <InputTime 
                               value={entry.pmOut} 
                               onChange={(v) => handleInputChange(entry.day, 'pmOut', v)} 
                               onFocus={() => handleInputFocus(entry.day, 'pmOut')}
                               isFillTarget={isFillTarget(entry.day, 'pmOut')}
                             />
                           </div>
                         </td>
                         <td className="py-2.5 px-6 text-right font-medium text-slate-700 bg-slate-50/30">
                           {formatMinutes(dayTotal)}
                         </td>
                       </tr>
                     );
                   })}
                </tbody>
             </table>
          </div>
          
          {/* Footer Totals */}
          <div className="bg-slate-800 text-white p-6 sm:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
             <div className="text-lg font-medium text-slate-300">Totale Mensile Lavorato</div>
             <div className="text-4xl font-bold tracking-tight text-blue-400">
               {formatMinutes(totalMonthlyMinutes)}
             </div>
          </div>
        </div>

        {/* Fine Mese Actions */}
        <div className="flex justify-end pt-4 pb-8" data-html2canvas-ignore>
          {!showEndMonthActions ? (
            <button 
              onClick={() => setShowEndMonthActions(true)}
              className="px-6 py-2.5 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-700 transition-colors shadow-sm"
            >
              Fine Mese
            </button>
          ) : (
            <div className="flex gap-4 items-center bg-white p-2 rounded-xl shadow-sm border border-slate-200">
              <button 
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={18} />
                {isGeneratingPDF ? "Generazione..." : "Scarica PDF"}
              </button>
              <button 
                onClick={handleNextMonth}
                className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                Mese Successivo
                <ArrowRight size={18} />
              </button>
              <button 
                onClick={() => setShowEndMonthActions(false)}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
