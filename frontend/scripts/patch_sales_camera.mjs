import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const salesPagePath = path.resolve(__dirname, '..', 'src', 'pages', 'SalesPage.jsx');

let content = fs.readFileSync(salesPagePath, 'utf8');

const targetOld = `              {/* مربع الكاميرا الفعلي المباشر */}
              <div className="relative h-48 sm:h-52 w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner">
                <div id="order-camera-reader" className="w-full h-full object-cover"></div>

                {scannerCameraStatus !== 'active' && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-2 text-white/80 p-4 text-center z-10">
                    {scannerCameraStatus === 'loading' ? (
                      <>
                        <RefreshCw className="w-7 h-7 animate-spin text-[#800000]" />
                        <span className="text-xs font-bold text-slate-200">جاري فتح الكاميرا المباشرة...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-7 h-7 text-[#800000] mb-0.5" />
                        <p className="text-[11px] text-slate-300 font-medium px-2 leading-relaxed max-w-xs">
                          {scannerCameraError || 'اضغط لتفعيل الكاميرا وقراءة الأكواد تلقائياً.'}
                        </p>
                        <button
                          type="button"
                          onClick={startOrderScanner}
                          className="mt-1 px-4 py-2 bg-[#800000] hover:bg-[#990000] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>تفعيل الكاميرا 📷</span>
                        </button>
                      </>
                    )}
                  </div>
                )}

                {scannerCameraStatus === 'active' && (
                  <>
                    <div className="absolute inset-x-6 h-0.5 bg-red-500 shadow-lg shadow-red-500/80 animate-pulse top-1/2 rounded-full z-20 pointer-events-none" />
                    <div className="absolute top-2 right-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold z-20 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                      <span>الكاميرا جاهزة للمسح</span>
                    </div>

                    {/* تنبيه وفلاش بصري عند المسح وفاصل زمني سلس قبل مسح القطعة التالية */}
                    {scannerCooldown && (
                      <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-white z-30 animate-fadeIn p-4 text-center">
                        <div className="w-10 h-10 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg">
                          <CheckCircle2 className="w-6 h-6 animate-bounce" />
                        </div>
                        <span className="text-xs font-bold text-emerald-300 px-2 leading-tight">
                          {scannerFeedback || 'تم المسح بنجاح!'}
                        </span>
                        <span className="text-[10px] text-emerald-200/90 bg-black/40 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          ⏳ انتظر لحظة لمسح المنتج التالي...
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>`;

const targetNew = `              {/* مربع الكاميرا الفعلي المباشر */}
              <div className="relative h-48 sm:h-52 w-full bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner group">
                <div id="order-camera-reader" className="w-full h-full object-cover"></div>

                {scannerCameraStatus !== 'active' && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white z-10 p-4">
                    {scannerCameraStatus === 'loading' ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-[#800000]" />
                        <span className="text-xs font-bold text-slate-300">جاري فتح الكاميرا...</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startOrderScanner}
                        className="px-5 py-2.5 bg-[#800000] hover:bg-[#990000] text-white font-bold rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
                      >
                        <Camera className="w-4 h-4" />
                        <span>تشغيل الكاميرا</span>
                      </button>
                    )}
                  </div>
                )}

                {scannerCameraStatus === 'active' && (
                  <>
                    {/* إطار المسح الليزري الأنيق والمبسط */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
                      <div className="relative w-40 h-40 sm:w-48 sm:h-48 border border-white/15 rounded-2xl">
                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-lg"></div>
                        
                        <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse top-1/2 -translate-y-1/2"></div>
                      </div>
                    </div>

                    {/* وميض نجاح أنيق وسلس بدون نصوص مكدسة */}
                    {scannerCooldown && (
                      <div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-[2px] flex items-center justify-center z-30 animate-in fade-in duration-200">
                        <div className="bg-emerald-500/20 border border-emerald-400/50 backdrop-blur-md px-4 py-2 rounded-2xl flex items-center gap-2 text-emerald-300 shadow-xl scale-105 transition-all">
                          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          <span className="text-xs font-black truncate max-w-[200px]">
                            {scannerFeedback || 'تم المسح بنجاح'}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>`;

// Normalize newlines for reliable replace
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedOld = targetOld.replace(/\r\n/g, '\n');
const normalizedNew = targetNew.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedOld)) {
  console.error('Target old block not found in SalesPage.jsx');
  process.exit(1);
}

const updatedContent = normalizedContent.replace(normalizedOld, normalizedNew);
fs.writeFileSync(salesPagePath, updatedContent, 'utf8');
console.log('Successfully updated SalesPage.jsx camera section!');
