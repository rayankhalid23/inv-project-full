import React, { useMemo, useState } from 'react';
import { Search, X, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { mediaUrl, onImageError } from '../../utils/media';

/**
 * =====================================================================
 * مُنتقي المنتجات المشترك (شجرة: منتج ← ألوان ← مقاسات)
 * =====================================================================
 * مصدر واحد لمنطق البحث والفلترة والعرض، تستخدمه شاشة "طلب جديد"
 * وشاشة "البيع السريع" معاً، فلا يختلف سلوك البحث بين الشاشتين
 * ولا يتكرر المنطق في مكانين.
 */

/**
 * تطابق نصي متسامح مع الأصفار البادئة:
 * كتابة "8" تجد الكود "0000008" — مفيد لقارئ الباركود.
 */
const matches = (value, query, cleanQuery) => {
  if (value === undefined || value === null) return false;
  const str = String(value).toLowerCase();
  if (query && str.includes(query)) return true;
  if (cleanQuery) {
    const cleanStr = str.replace(/^0+/, '');
    if (cleanStr && cleanStr.includes(cleanQuery)) return true;
    const digitsOnly = str.replace(/^[^\d]+/, '').replace(/^0+/, '');
    if (digitsOnly && digitsOnly.includes(cleanQuery)) return true;
  }
  return false;
};

/**
 * يفلتر قائمة المنتجات مرة واحدة في الأب.
 * مهم للأداء: بدونه كان كل عنصر يفحص نفسه في كل ضغطة مفتاح.
 */
export const filterProducts = (products, rawQuery) => {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) return products;
  const cleanQuery = query.replace(/^0+/, '');

  return products.filter((p) =>
    matches(p.name, query, cleanQuery) ||
    matches(p.code, query, cleanQuery) ||
    matches(p.catalog_name, query, cleanQuery) ||
    p.colors?.some((c) =>
      matches(c.color_name, query, cleanQuery) ||
      c.variants?.some((v) =>
        matches(v.sku, query, cleanQuery) ||
        matches(v.size_name || v.size, query, cleanQuery) ||
        matches(v.qr_code, query, cleanQuery)
      )
    )
  );
};

/**
 * بطاقة منتج واحد قابلة للطي مع ألوانه ومقاساته.
 * React.memo ضروري: القائمة تُعرض داخل نوافذ كبيرة، وبدونه تُعاد
 * تهيئة كل العناصر مع أي تغيير حالة في الأب.
 */
const ProductSelector = React.memo(function ProductSelector({ product, onAddVariant, showPrice = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const price = Number(product.price ?? product.selling_price ?? product.prices?.selling_price ?? 0);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((p) => !p)}
        className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-right"
      >
        <div className="flex items-center gap-3 min-w-0">
          {product.image ? (
            <img
              src={mediaUrl(product.image)}
              alt={product.name}
              className="h-8 w-8 rounded object-cover border border-slate-200 shrink-0"
              onError={onImageError}
            />
          ) : (
            <div className="h-8 w-8 rounded bg-slate-200 flex items-center justify-center border border-slate-200 shrink-0">
              <Package className="h-4 w-4 text-slate-400" />
            </div>
          )}
          <div className="text-right min-w-0">
            <span className="text-xs font-bold text-slate-800 block truncate">{product.name}</span>
            <span className="text-[10px] text-slate-400 font-medium">
              {product.code ? `#${product.code}` : ''}
              {showPrice && price > 0 ? ` · ${price} د.ل` : ''}
            </span>
          </div>
        </div>
        {isOpen
          ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          : <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
      </button>

      {isOpen && product.colors?.map((color) => (
        <div key={color.id} className="border-t border-slate-100">
          <div className="px-3 py-2 bg-white text-[11px] font-bold text-slate-600 flex items-center gap-2">
            {color.color_image ? (
              <img
                src={mediaUrl(color.color_image)}
                alt={color.color_name}
                className="h-5 w-5 rounded-full object-cover border border-slate-200 shrink-0"
                onError={onImageError}
              />
            ) : (
              <span className="h-2 w-2 rounded-full bg-slate-300 inline-block shrink-0" />
            )}
            {color.color_name}
          </div>

          {color.variants?.map((variant) => {
            const available = variant.quantity_available ?? 0;
            const sizeLabel = variant.size_name || variant.size || 'N/A';
            return (
              <button
                type="button"
                key={variant.id}
                disabled={available <= 0}
                onClick={() => onAddVariant(variant, color.color_name, product.name, sizeLabel, product)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-blue-50 disabled:hover:bg-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-right border-t border-slate-50"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-slate-700 font-medium">{sizeLabel}</span>
                  {variant.sku && (
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                      {variant.sku}
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                  }`}>
                    متاح: {available}
                  </span>
                </div>
                <span className="text-[10px] text-[#6b1d2f] font-bold bg-[#6b1d2f]/10 px-2 py-0.5 rounded shrink-0">
                  {available > 0 ? '+ إضافة' : 'نفد'}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});

/**
 * الواجهة الكاملة: حقل بحث + قائمة منتجات مفلترة.
 * @param {Array}    products      قائمة المنتجات (شكل getAllProductsWithVariants)
 * @param {Function} onAddVariant  (variant, colorName, productName, sizeName, product)
 * @param {boolean}  showPrice     إظهار سعر المنتج بجانب الكود
 * @param {string}   maxHeight     ارتفاع منطقة القائمة
 */
export default function ProductPicker({
  products = [],
  onAddVariant,
  showPrice = false,
  maxHeight = 'max-h-48',
  placeholder = 'ابحث بالاسم أو الكود أو المقاس... (الأصفار البادئة غير مهمة)',
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterProducts(products, query), [products, query]);

  const displayProducts = useMemo(() => {
    return query ? filtered.slice(0, 60) : filtered.slice(0, 35);
  }, [filtered, query]);

  return (
    <div className="space-y-2 border border-slate-200 rounded-xl p-2 bg-white">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full text-xs pr-9 pl-8 py-2 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-[#800000] transition-all"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className={`space-y-1 ${maxHeight} overflow-y-auto`}>
        {products.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">لا توجد منتجات متاحة حالياً</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-4 text-xs text-slate-400">لا توجد نتائج مطابقة لبحثك</div>
        ) : (
          displayProducts.map((product) => (
            <ProductSelector
              key={product.id}
              product={product}
              onAddVariant={onAddVariant}
              showPrice={showPrice}
            />
          ))
        )}
      </div>
    </div>
  );
}
