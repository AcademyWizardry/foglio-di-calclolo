import React, { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Trash2, Banknote, Pencil } from 'lucide-react';

interface Trattenuta {
  id: string;
  descrizione: string;
  importo: number;
  data: string;
}

export default function Stipendio({ onClose, highlightId, currentMonth }: { onClose: () => void, highlightId?: string | null, currentMonth: string }) {
  const [stipendioTotale, setStipendioTotale] = useState<number | ''>(() => {
    const saved = localStorage.getItem('timesheet-stipendio-totale');
    return saved ? Number(saved) : '';
  });
  const [trattenute, setTrattenute] = useState<Trattenuta[]>(() => {
    const saved = localStorage.getItem(`timesheet-trattenute-${currentMonth}`);
    return saved ? JSON.parse(saved) : [];
  });
  const [nuovaDescrizione, setNuovaDescrizione] = useState('Note personali');
  const [dettaglioNota, setDettaglioNota] = useState('');
  const [nuovoImporto, setNuovoImporto] = useState<number | ''>('');
  const [nuovaData, setNuovaData] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [itemToEdit, setItemToEdit] = useState<{id: string, descrizione: string, importo: number | '', data: string, dettaglio?: string} | null>(null);

  // Highlight scroll
  useEffect(() => {
    if (highlightId) {
      setTimeout(() => {
        const el = document.getElementById(`trattenuta-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightId, trattenute]);

  // Salvataggio sul localStorage
  useEffect(() => {
    if (stipendioTotale !== '') {
      localStorage.setItem('timesheet-stipendio-totale', stipendioTotale.toString());
    } else {
      localStorage.removeItem('timesheet-stipendio-totale');
    }
    localStorage.setItem(`timesheet-trattenute-${currentMonth}`, JSON.stringify(trattenute));
  }, [stipendioTotale, trattenute, currentMonth]);

  const aggiungiTrattenuta = () => {
    const descFinale = nuovaDescrizione === 'Note personali' ? (dettaglioNota.trim() || 'Note personali') : nuovaDescrizione;
    if (nuovaDescrizione && nuovoImporto !== '' && nuovaData && (nuovaDescrizione !== 'Note personali' || dettaglioNota.trim() !== '')) {
      setTrattenute([...trattenute, {
        id: crypto.randomUUID(),
        descrizione: descFinale,
        importo: Number(nuovoImporto),
        data: nuovaData
      }]);
      setNuovoImporto('');
      setDettaglioNota('');
    }
  };

  const rimuoviTrattenuta = (id: string) => {
    setItemToDelete(id);
  };

  const confermaRimozione = () => {
    if (itemToDelete) {
      setTrattenute(trattenute.filter(t => t.id !== itemToDelete));
      setItemToDelete(null);
    }
  };

  const annullaRimozione = () => {
    setItemToDelete(null);
  };

  const apriModifica = (t: Trattenuta) => {
    const isStandard = vociDisponibili.includes(t.descrizione);
    setItemToEdit({ 
      id: t.id, 
      descrizione: isStandard ? t.descrizione : 'Note personali', 
      importo: t.importo, 
      data: t.data,
      dettaglio: isStandard ? '' : t.descrizione
    });
  };

  const salvaModifica = () => {
    if (itemToEdit && itemToEdit.descrizione && itemToEdit.importo !== '' && itemToEdit.data) {
      const descFinale = itemToEdit.descrizione === 'Note personali' ? (itemToEdit.dettaglio?.trim() || 'Note personali') : itemToEdit.descrizione;
      
      if (itemToEdit.descrizione === 'Note personali' && !itemToEdit.dettaglio?.trim()) {
        return;
      }

      setTrattenute(trattenute.map(t => 
        t.id === itemToEdit.id 
          ? { ...t, descrizione: descFinale, importo: Number(itemToEdit.importo), data: itemToEdit.data } 
          : t
      ));
      setItemToEdit(null);
    }
  };

  const totaleTrattenute = trattenute.reduce((acc, t) => acc + t.importo, 0);
  const netto = (Number(stipendioTotale) || 0) - totaleTrattenute;

  const vociDisponibili = [
    "Note personali",
    "Acconto",
    "Prestito",
    "Mensa",
    "Rimborso Spese",
    "Trattenuta Sindacale",
    "Danni/Multe",
    "Assicurazione",
    "Anticipo TFR"
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4 sm:px-6 lg:px-8 font-sans text-slate-900">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* Intestazione */}
        <div className="flex items-center justify-between bg-white p-5 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors shadow-sm"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
              <Banknote size={28} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Gestione Stipendio</h1>
          </div>
        </div>

        {/* Totale Mensile */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <label className="block text-sm font-medium text-slate-700">Stipendio Mensile Totale (€)</label>
          <input
            type="number"
            placeholder="Es: 1500"
            value={stipendioTotale}
            onChange={(e) => setStipendioTotale(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full text-2xl px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-medium text-slate-800"
          />
        </div>

        {/* Sezione Trattenute / Acconti */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <h2 className="text-lg font-semibold text-slate-800">Trattenute e Acconti</h2>
          
          <div className="flex gap-3 items-start flex-col sm:flex-row">
            <div className="flex-1 w-full space-y-1">
              <select
                value={nuovaDescrizione}
                onChange={(e) => {
                  setNuovaDescrizione(e.target.value);
                  if (e.target.value !== 'Note personali') setDettaglioNota('');
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
              >
                {vociDisponibili.map(voce => (
                  <option key={voce} value={voce}>{voce}</option>
                ))}
              </select>
              {nuovaDescrizione === 'Note personali' && (
                <input
                  type="text"
                  placeholder="Es: Spesa imprevista..."
                  value={dettaglioNota}
                  onChange={(e) => setDettaglioNota(e.target.value)}
                  className="w-full mt-2 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  autoFocus
                />
              )}
            </div>
            <div className="w-full sm:w-40 space-y-1">
              <input
                type="date"
                value={nuovaData}
                onChange={(e) => setNuovaData(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <div className="w-full sm:w-32 space-y-1">
              <input
                type="number"
                placeholder="Importo (€)"
                value={nuovoImporto}
                onChange={(e) => setNuovoImporto(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
              />
            </div>
            <button
              onClick={aggiungiTrattenuta}
              disabled={!nuovaDescrizione || nuovoImporto === '' || !nuovaData || (nuovaDescrizione === 'Note personali' && !dettaglioNota.trim())}
              className="w-full sm:w-auto p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors disabled:opacity-50 flex justify-center shadow-sm h-fit"
            >
              <Plus size={20} />
            </button>
          </div>

          {trattenute.length > 0 && (
            <div className="space-y-2 mt-6">
              {trattenute.map(t => (
                <div 
                  key={t.id} 
                  id={`trattenuta-${t.id}`}
                  className={`flex justify-between items-center p-3 rounded-lg border flex-wrap gap-2 transition-all duration-700 relative ${highlightId === t.id ? 'bg-yellow-100 border-yellow-400 ring-2 ring-yellow-300 shadow-md z-10' : 'bg-slate-50 border-slate-100'}`}
                >
                  <div className="flex flex-col">
                    <span className={`text-sm ${highlightId === t.id ? 'text-black font-extrabold uppercase' : 'font-medium text-slate-700'}`}>{t.descrizione}</span>
                    <span className={`text-xs ${highlightId === t.id ? 'text-black font-bold' : 'text-slate-500'}`}>{new Date(t.data).toLocaleDateString('it-IT')}</span>
                  </div>
                  <div className="flex items-center gap-4 ml-auto">
                    <span className={`text-sm ${highlightId === t.id ? 'text-black font-extrabold text-base' : 'text-rose-600 font-bold'}`}>- {t.importo} €</span>
                    <button 
                      onClick={() => apriModifica(t)}
                      className="flex items-center gap-1 p-1.5 px-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors shadow-sm text-xs font-medium border border-slate-200"
                    >
                      <Pencil size={14} />
                      Modifica
                    </button>
                    <button 
                      onClick={() => rimuoviTrattenuta(t.id)}
                      className="p-1.5 bg-slate-800 text-white hover:bg-rose-600 rounded-lg transition-colors shadow-sm"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center p-3 text-sm font-medium text-slate-600 border-t border-slate-200 mt-2">
                <span>Totale Trattenute</span>
                <span className="text-rose-600">- {totaleTrattenute} €</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Rimanenza */}
        <div className="bg-emerald-800 text-white p-6 sm:px-8 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm">
           <div className="text-lg font-medium text-emerald-100/80">Netto da Erogare</div>
           <div className="text-4xl font-bold tracking-tight text-white">
             € {netto.toFixed(2)}
           </div>
        </div>

        {/* Modal di Conferma Eliminazione */}
        {itemToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-slate-800 mb-2">Conferma Eliminazione</h3>
              <p className="text-slate-600 text-sm mb-6">
                Sei sicuro di voler eliminare questa voce?
              </p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={annullaRimozione}
                  className="px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button 
                  onClick={confermaRimozione}
                  className="px-4 py-2 text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 rounded-lg transition-colors shadow-sm"
                >
                  Sì, Elimina
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal di Modifica */}
        {itemToEdit && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in duration-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4">Modifica Voce</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Voce</label>
                  <select
                    value={itemToEdit.descrizione}
                    onChange={(e) => {
                      const newDesc = e.target.value;
                      setItemToEdit({...itemToEdit, descrizione: newDesc, dettaglio: newDesc === 'Note personali' ? '' : itemToEdit.dettaglio});
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                  >
                    {vociDisponibili.map(voce => (
                      <option key={voce} value={voce}>{voce}</option>
                    ))}
                  </select>
                  {itemToEdit.descrizione === 'Note personali' && (
                    <input
                      type="text"
                      placeholder="Es: Spesa imprevista..."
                      value={itemToEdit.dettaglio || ''}
                      onChange={(e) => setItemToEdit({...itemToEdit, dettaglio: e.target.value})}
                      className="w-full mt-2 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data</label>
                  <input
                    type="date"
                    value={itemToEdit.data}
                    onChange={(e) => setItemToEdit({...itemToEdit, data: e.target.value})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Importo (€)</label>
                  <input
                    type="number"
                    value={itemToEdit.importo}
                    onChange={(e) => setItemToEdit({...itemToEdit, importo: e.target.value === '' ? '' : Number(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setItemToEdit(null)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Annulla
                </button>
                <button 
                  onClick={salvaModifica}
                  disabled={!itemToEdit.descrizione || itemToEdit.importo === '' || !itemToEdit.data || (itemToEdit.descrizione === 'Note personali' && !itemToEdit.dettaglio?.trim())}
                  className="px-4 py-2 text-sm font-medium bg-slate-800 text-white hover:bg-slate-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                >
                  Salva Modifiche
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
