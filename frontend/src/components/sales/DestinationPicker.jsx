import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, ChevronDown, Check, X, Loader2 } from 'lucide-react';

/**
 * تطبيع النص العربي لتسهيل البحث:
 * إزالة التشكيل والتطويل، وتوحيد الألف والهمزة والياء والتاء المربوطة.
 */
export const normalizeArabic = (text = '') =>
  String(text)
    .replace(/[ً-ْـ]/g, '')   // تشكيل + تطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** بناء قائمة موحّدة مسطّحة لكل أزواج (المدينة - المنطقة) */
export const buildDestinationOptions = (citiesAreas = {}) => {
  const options = [];
  const cities = Object.keys(citiesAreas || {}).sort((a, b) => a.localeCompare(b, 'ar'));

  for (const city of cities) {
    const areas = Array.isArray(citiesAreas[city]) ? citiesAreas[city] : [];
    const uniqueAreas = [...new Set(areas.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    const finalAreas = uniqueAreas.length > 0 ? uniqueAreas : ['وسط المدينة'];

    for (const area of finalAreas) {
      options.push({
        key: `${city}||${area}`,
        city,
        area,
        label: `${city} - ${area}`,
        search: normalizeArabic(`${city} ${area}`),
      });
    }
  }
  return options;
};

const PAGE_SIZE = 120;

/**
 * حقل موحّد لاختيار وجهة التوصيل (المدينة - المنطقة) بقائمة منسدلة قابلة للبحث.
 * يعرض كل مدن ومناطق درب السبيل تحت بعضها بصيغة «المدينة - المنطقة».
 */
export default function DestinationPicker({
  citiesAreas = {},
  city = '',
  area = '',
  onChange,
  loading = false,
  disabled = false,
  accent = 'maroon',            // 'maroon' | 'amber'
  label = 'المنطقة',
  required = true,
  placeholder = 'اختر المنطقة (المدينة - المنطقة)',
}) {
  const [open, setOpen]            = useState(false);
  const [query, setQuery]          = useState('');
  const [visibleCount, setVisible] = useState(PAGE_SIZE);
  const [activeIndex, setActive]   = useState(0);

  const searchRef    = useRef(null);
  const listRef      = useRef(null);
  const containerRef = useRef(null);

  const accentRing = accent === 'amber'
    ? 'focus:border-amber-600 focus:ring-amber-500/10'
    : 'focus:border-[#800000] focus:ring-[#800000]/10';
  const accentText   = accent === 'amber' ? 'text-amber-600' : 'text-[#800000]';
  const accentActive = accent === 'amber'
    ? 'bg-amber-50 text-amber-800'
    : 'bg-[#800000]/5 text-[#800000]';
  const accentBorder = accent === 'amber' ? 'border-amber-500' : 'border-[#800000]';

  const options = useMemo(() => buildDestinationOptions(citiesAreas), [citiesAreas]);

  const filtered = useMemo(() => {
    const q = normalizeArabic(query);
    if (!q) return options;
    const tokens = q.split(' ').filter(Boolean);
    return options.filter(opt => tokens.every(t => opt.search.includes(t)));
  }, [options, query]);

  const selectedKey   = city ? `${city}||${area || ''}` : '';
  const selectedLabel = city ? `${city}${area ? ` - ${area}` : ''}` : '';

  // إعادة ضبط القائمة عند كل بحث جديد
  useEffect(() => {
    setVisible(PAGE_SIZE);
    setActive(0);
  }, [query]);

  // عند الفتح: تركيز حقل البحث وإظهار الخيار المحدد حالياً
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      searchRef.current?.focus();
      const idx = filtered.findIndex(o => o.key === selectedKey);
      if (idx >= 0) {
        setActive(idx);
        if (idx >= PAGE_SIZE) setVisible(Math.ceil((idx + 1) / PAGE_SIZE) * PAGE_SIZE);
      }
      containerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // إبقاء العنصر النشط ظاهراً أثناء التنقل بالكيبورد
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const pick = useCallback((opt) => {
    if (!opt) return;
    onChange?.({ city: opt.city, area: opt.area });
    setOpen(false);
    setQuery('');
  }, [onChange]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => {
        const next = Math.min(i + 1, filtered.length - 1);
        if (next >= visibleCount - 1) setVisible(v => v + PAGE_SIZE);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setQuery('');
    }
  };

  const onListScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60 && visibleCount < filtered.length) {
      setVisible(v => v + PAGE_SIZE);
    }
  };

  const shown = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-1" ref={containerRef}>
      <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
        <MapPin className={`h-3.5 w-3.5 ${accentText}`} />
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {/* زر فتح القائمة — يعرض الوجهة المختارة */}
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between gap-2 text-xs px-3 py-2.5 border rounded-xl bg-white text-right transition-all
          ${open ? `${accentBorder} ring-2 ring-slate-900/5` : 'border-slate-200 hover:border-slate-300'}
          ${disabled || loading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`flex-1 truncate font-medium ${selectedLabel ? 'text-slate-800' : 'text-slate-400'}`}>
          {loading ? 'جاري جلب المدن والمناطق...' : (selectedLabel || placeholder)}
        </span>
        {loading
          ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
          : <ChevronDown className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {/* لوحة البحث والقائمة — داخل التدفق حتى لا تُقص داخل النوافذ المنبثقة */}
      {open && (
        <div className="mt-1.5 border border-slate-200 rounded-xl bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="ابحث باسم المدينة أو المنطقة... مثال: بنغازي الليثي"
                className={`w-full text-xs pr-8 pl-8 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 ${accentRing} text-slate-800`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); searchRef.current?.focus(); }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            ref={listRef}
            onScroll={onListScroll}
            className="max-h-64 overflow-y-auto overscroll-contain py-1"
          >
            {shown.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                لا توجد نتائج مطابقة لبحثك
              </div>
            ) : (
              shown.map((opt, idx) => {
                const isSelected = opt.key === selectedKey;
                const isActive   = idx === activeIndex;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => pick(opt)}
                    className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors
                      ${isSelected ? `${accentActive} font-bold` : isActive ? 'bg-slate-50' : 'bg-white'}`}
                  >
                    <span className="truncate">
                      <span className={isSelected ? '' : 'text-slate-800 font-semibold'}>{opt.city}</span>
                      <span className="text-slate-400 mx-1">-</span>
                      <span className={isSelected ? '' : 'text-slate-600'}>{opt.area}</span>
                    </span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50/80 text-[10px] text-slate-500 flex items-center justify-between">
            <span>
              {filtered.length > shown.length
                ? `عرض ${shown.length} من ${filtered.length} منطقة — مرّر للأسفل للمزيد`
                : `${filtered.length} منطقة متاحة`}
            </span>
            <span className="hidden sm:inline">↑↓ للتنقل • Enter للاختيار</span>
          </div>
        </div>
      )}
    </div>
  );
}
