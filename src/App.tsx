import React, { useState, useEffect, useRef } from 'react';
import { CalendarClock, Download, ArrowRight, X, Sun, Moon, LogIn, LogOut } from 'lucide-react';
import { db, auth, googleProvider } from './lib/firebase';
import { signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

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

const adjustEntriesToMonthLength = (entries: DayEntry[], daysInMonth: number): DayEntry[] => {
  if (!entries || entries.length === 0) return generateDefaultEntries(daysInMonth);
  if (entries.length === daysInMonth) return entries;
  
  if (entries.length > daysInMonth) {
    return entries.slice(0, daysInMonth);
  }
  
  const newEntries = [...entries];
  for (let i = entries.length; i < daysInMonth; i++) {
    newEntries.push({
      day: i + 1,
      amIn: '',
      amOut: '',
      pmIn: '',
      pmOut: '',
    });
  }
  return newEntries;
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

function formatTimeInputString(value: string): string {
  let formatted = value.trim();
  if (!formatted) return '';

  formatted = formatted.replace(/[.,;]/g, ':');

  if (/^\d{3,4}$/.test(formatted)) {
    const len = formatted.length;
    formatted = `${formatted.substring(0, len - 2)}:${formatted.substring(len - 2)}`;
  }

  if (/^\d{1,2}$/.test(formatted)) {
    formatted = `${formatted.padStart(2, '0')}:00`;
  } else {
    const match = formatted.match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      formatted = `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}`;
    }
  }

  if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(formatted)) {
    return formatted;
  }
  return formatted;
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
    const formatted = formatTimeInputString(localValue);
    setLocalValue(formatted);
    onChange(formatted);
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
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('timesheet-user-name') || '';
  });
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('timesheet-dark-mode') === 'true';
  });
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [fillModeState, setFillModeState] = useState<{ day: number, field: keyof Omit<DayEntry, 'day'>, keyword: string } | null>(null);
  const fillModeRef = useRef<{ day: number, field: keyof Omit<DayEntry, 'day'>, keyword: string } | null>(null);
  const fieldsOrder: (keyof Omit<DayEntry, 'day'>)[] = ['amIn', 'amOut', 'pmIn', 'pmOut'];

  // Default times states
  const [defaultAmIn, setDefaultAmIn] = useState<string>('');
  const [defaultPmIn, setDefaultPmIn] = useState<string>('');
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [includeSaturday, setIncludeSaturday] = useState<boolean>(false);
  const [includeSunday, setIncludeSunday] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoaded(true);
      if (currentUser) {
        try {
          const userSettingsRef = doc(db, 'user_settings', currentUser.uid);
          const userSettingsSnap = await getDoc(userSettingsRef);
          if (userSettingsSnap.exists()) {
            const data = userSettingsSnap.data();
            if (data.userName) setUserName(data.userName);
            if (data.isDarkMode !== undefined) setIsDarkMode(data.isDarkMode);
          } else {
            await setDoc(userSettingsRef, {
              userName: localStorage.getItem('timesheet-user-name') || '',
              isDarkMode: localStorage.getItem('timesheet-dark-mode') === 'true',
              updatedAt: new Date()
            });
          }
        } catch (e) {
          console.error("Error loading user settings", e);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('timesheet-dark-mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark-mode');
    }
    if (user && isAuthLoaded) {
      setDoc(doc(db, 'user_settings', user.uid), { isDarkMode }, { merge: true }).catch(console.error);
    }
  }, [isDarkMode, user, isAuthLoaded]);

  useEffect(() => {
    localStorage.setItem('timesheet-user-name', userName);
    if (user && isAuthLoaded) {
      setDoc(doc(db, 'user_settings', user.uid), { userName }, { merge: true }).catch(console.error);
    }
  }, [userName, user, isAuthLoaded]);

  useEffect(() => {
    if (!isAuthLoaded) return;
    
    localStorage.setItem('timesheet-current-month', currentMonth);
    
    let daysInMonth = 31;
    let autoFirstDay = 1;
    if (currentMonth) {
      const [y, m] = currentMonth.split('-');
      
      const monthDaysMap: Record<string, number> = {
        '01': 31,
        '02': 28,
        '03': 31,
        '04': 30,
        '05': 31,
        '06': 30,
        '07': 31,
        '08': 31,
        '09': 30,
        '10': 31,
        '11': 30,
        '12': 31
      };
      
      daysInMonth = monthDaysMap[m] || 31;
      
      const firstDate = new Date(parseInt(y), parseInt(m) - 1, 1);
      autoFirstDay = firstDate.getDay();
    }

    const loadData = async () => {
      if (user) {
        try {
          const timesheetRef = doc(db, 'timesheets', `${user.uid}_${currentMonth}`);
          const snap = await getDoc(timesheetRef);
          if (snap.exists()) {
            const data = snap.data();
            const rawEntries = data.entries || [];
            setEntries(adjustEntriesToMonthLength(rawEntries, daysInMonth));
            setFirstDay(data.firstDay !== undefined ? data.firstDay : autoFirstDay);
          } else {
            const savedEntries = localStorage.getItem(`${STORAGE_KEY}-${currentMonth}`);
            const savedFirstDay = localStorage.getItem(`${STORAGE_KEY_FIRST_DAY}-${currentMonth}`);
            const initialEntries = savedEntries ? adjustEntriesToMonthLength(JSON.parse(savedEntries), daysInMonth) : generateDefaultEntries(daysInMonth);
            const initialFirstDay = savedFirstDay ? parseInt(savedFirstDay, 10) : autoFirstDay;
            
            setEntries(initialEntries);
            setFirstDay(initialFirstDay);
            
            await setDoc(timesheetRef, {
              userId: user.uid,
              month: currentMonth,
              firstDay: initialFirstDay,
              entries: initialEntries,
              updatedAt: new Date()
            });
          }
        } catch (e) {
          console.error("Error loading timesheet", e);
          setEntries(generateDefaultEntries(daysInMonth));
          setFirstDay(autoFirstDay);
        }
      } else {
        const savedEntries = localStorage.getItem(`${STORAGE_KEY}-${currentMonth}`);
        if (savedEntries) {
          try {
            setEntries(adjustEntriesToMonthLength(JSON.parse(savedEntries), daysInMonth));
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
      }
      setIsLoaded(true);
    };

    setIsLoaded(false);
    loadData();
  }, [currentMonth, user, isAuthLoaded]);

  useEffect(() => {
    if (isLoaded && entries.length > 0) {
      localStorage.setItem(`${STORAGE_KEY}-${currentMonth}`, JSON.stringify(entries));
      if (user) {
        const timesheetRef = doc(db, 'timesheets', `${user.uid}_${currentMonth}`);
        setDoc(timesheetRef, {
          userId: user.uid,
          month: currentMonth,
          firstDay: firstDay,
          entries: entries,
          updatedAt: new Date()
        }, { merge: true }).catch(console.error);
      }
    }
  }, [entries, currentMonth, isLoaded, user, firstDay]);

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

  const applyDefaultTimes = () => {
    setEntries(prev => prev.map(entry => {
      const currentDayIndex = (firstDay + entry.day - 1) % 7;
      const isSaturday = currentDayIndex === 6;
      const isSunday = currentDayIndex === 0;

      if (isSaturday && !includeSaturday) return entry;
      if (isSunday && !includeSunday) return entry;

      return {
        ...entry,
        amIn: defaultAmIn || entry.amIn,
        pmIn: defaultPmIn || entry.pmIn
      };
    }));
    setShowApplyModal(false);
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

  const handleDownloadCSV = () => {
    const [year, month] = currentMonth.split('-');
    const monthNames = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    const monthNameStr = monthNames[parseInt(month, 10) - 1];

    let csvContent = '\uFEFFsep=;\n';
    
    csvContent += `"Foglio Presenze - ${monthNameStr} ${year}";"";"";"";"";"";""\n`;
    if (userName) {
      csvContent += `"Dipendente:";"${userName}";"";"";"";"";""\n`;
    }
    csvContent += `"";"";"";"";"";"";""\n`;
    
    csvContent += '"Giorno";"Giorno Settimana";"Entrata Mattino";"Uscita Mattino";"Entrata Pomeriggio";"Uscita Pomeriggio";"Totale Ore"\n';

    let totalMonthMinutes = 0;

    entries.forEach(entry => {
      const dayTotal = calculateDayMinutes(entry);
      totalMonthMinutes += dayTotal;
      
      const currentDayIndex = (firstDay + entry.day - 1) % 7;
      const dayName = shortDays[currentDayIndex];
      
      const formatTime = (time: string) => time ? `"${time}"` : '""';
      const formattedTotal = dayTotal > 0 ? `"${formatMinutes(dayTotal)}"` : '""';
      
      csvContent += `"${entry.day}";"${dayName}";${formatTime(entry.amIn)};${formatTime(entry.amOut)};${formatTime(entry.pmIn)};${formatTime(entry.pmOut)};${formattedTotal}\n`;
    });

    csvContent += `"Totale Mensile Lavorato:";"";"";"";"";"";"${formatMinutes(totalMonthMinutes)}"\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const safeUserName = userName ? userName.replace(/\s+/g, '_') : 'Dipendente';
    link.download = `Foglio_Presenze_${safeUserName}_${currentMonth}.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Foglio Presenze</h1>
                <button
                  onClick={() => setShowApplyModal(true)}
                  className="sm:hidden text-[10px] sm:text-xs font-semibold uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1 rounded transition-colors"
                >
                  Orari Fissi
                </button>
              </div>
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
            {user ? (
              <div className="flex items-center gap-3 bg-white pl-3 pr-2 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                <div className="text-sm font-medium text-slate-700 hidden sm:block">
                  {user.displayName || user.email}
                </div>
                <button
                  onClick={() => signOut(auth)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                  title="Disconnetti"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => signInWithPopup(auth, googleProvider)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg font-medium transition-colors shadow-sm text-sm sm:text-base"
              >
                <LogIn size={18} />
                <span className="hidden sm:inline">Accedi per Sincronizzare</span>
              </button>
            )}
            <input 
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="px-2 sm:px-4 py-2 min-w-[150px] bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer shadow-sm"
            />
          </div>
        </div>

        {/* Default Times Settings */}
        <div className="hidden sm:flex bg-white p-4 rounded-xl shadow-sm border border-slate-200 items-center gap-4 justify-between">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium text-slate-600">Orari Fissi (Entrata):</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Mattina</label>
              <input
                type="text"
                placeholder="08:00"
                value={defaultAmIn}
                onChange={(e) => setDefaultAmIn(e.target.value)}
                onBlur={(e) => setDefaultAmIn(formatTimeInputString(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 text-center"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Pomeriggio</label>
              <input
                type="text"
                placeholder="14:00"
                value={defaultPmIn}
                onChange={(e) => setDefaultPmIn(e.target.value)}
                onBlur={(e) => setDefaultPmIn(formatTimeInputString(e.target.value))}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 text-center"
              />
            </div>
          </div>
          <button
            onClick={() => setShowApplyModal(true)}
            disabled={!defaultAmIn && !defaultPmIn}
            className="whitespace-nowrap px-4 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            Applica al mese
          </button>
        </div>

        {/* Modal for Default Times */}
        {showApplyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-slate-800">Applica Orari Fissi</h3>
                <button onClick={() => setShowApplyModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              {/* Mobile Inputs (Hidden on Desktop) */}
              <div className="sm:hidden space-y-3 mb-5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Entrata Mattina</label>
                  <input
                    type="text"
                    placeholder="08:00"
                    value={defaultAmIn}
                    onChange={(e) => setDefaultAmIn(e.target.value)}
                    onBlur={(e) => setDefaultAmIn(formatTimeInputString(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-center"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-500">Entrata Pomeriggio</label>
                  <input
                    type="text"
                    placeholder="14:00"
                    value={defaultPmIn}
                    onChange={(e) => setDefaultPmIn(e.target.value)}
                    onBlur={(e) => setDefaultPmIn(formatTimeInputString(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-center"
                  />
                </div>
              </div>

              <p className="text-sm text-slate-600 mb-5">
                <span className="hidden sm:inline">Vuoi applicare questi orari di entrata ({defaultAmIn || '-'} / {defaultPmIn || '-'}) anche al fine settimana?</span>
                <span className="sm:hidden">Vuoi applicare gli orari anche al fine settimana?</span>
              </p>
              
              <div className="space-y-3 mb-6">
                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={includeSaturday}
                      onChange={(e) => setIncludeSaturday(e.target.checked)}
                      className="w-5 h-5 border-2 border-slate-300 rounded cursor-pointer transition-colors checked:bg-blue-600 checked:border-blue-600 appearance-none"
                    />
                    {includeSaturday && <svg className="absolute w-3.5 h-3.5 text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm font-medium text-slate-700">Includi Sabato</span>
                </label>
                
                <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-200 transition-colors">
                  <div className="relative flex items-center">
                    <input 
                      type="checkbox" 
                      checked={includeSunday}
                      onChange={(e) => setIncludeSunday(e.target.checked)}
                      className="w-5 h-5 border-2 border-slate-300 rounded cursor-pointer transition-colors checked:bg-blue-600 checked:border-blue-600 appearance-none"
                    />
                    {includeSunday && <svg className="absolute w-3.5 h-3.5 text-white left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <span className="text-sm font-medium text-slate-700">Includi Domenica</span>
                </label>
              </div>

              <div className="flex gap-3 justify-end">
                <button 
                  onClick={() => setShowApplyModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button 
                  onClick={applyDefaultTimes}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Conferma e Applica
                </button>
              </div>
            </div>
          </div>
        )}
        
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
        <div className="flex justify-end pt-4 pb-8">
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
                onClick={handleDownloadCSV}
                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Download size={18} />
                Scarica Excel (CSV)
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
