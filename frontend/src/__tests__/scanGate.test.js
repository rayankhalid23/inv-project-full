import { describe, it, expect } from 'vitest';
import { createScanGate } from '../hooks/scanGate';

/**
 * ساعة وهمية: منطق البوابة كله زمني، واختباره بساعة حقيقية يعني
 * انتظاراً فعلياً واختبارات هشّة.
 */
const makeClock = () => {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
  };
};

const makeGate = (clock, opts = {}) => createScanGate({
  minGapMs: 400,
  sameCodeCooldownMs: 2200,
  now: clock.now,
  ...opts,
});

describe('createScanGate — قبول الكود الممسوح', () => {
  it('يقبل أول كود ويعيده منظَّفاً من الفراغات', () => {
    const clock = makeClock();
    const gate = makeGate(clock);
    expect(gate.accept('  VAR:12|SKU:A1  ')).toBe('VAR:12|SKU:A1');
  });

  it('يرفض القيم الفارغة وغير الموجودة', () => {
    const clock = makeClock();
    const gate = makeGate(clock);
    expect(gate.accept('')).toBeNull();
    expect(gate.accept('   ')).toBeNull();
    expect(gate.accept(null)).toBeNull();
    expect(gate.accept(undefined)).toBeNull();
  });

  it('يرفض أي كود ما دامت المعالجة السابقة جارية', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');
    expect(gate.isProcessing).toBe(true);

    // حتى لو مرّ وقت طويل وكان الكود مختلفاً — الطلب السابق لم ينتهِ بعد
    clock.advance(10_000);
    expect(gate.accept('B')).toBeNull();

    gate.release();
    expect(gate.accept('B')).toBe('B');
  });
});

describe('createScanGate — منع تكرار المسح بالخطأ', () => {
  it('يرفض نفس الكود إذا بقي أمام العدسة بعد قراءته', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');
    gate.release();

    // الكاميرا تُطلق النداء ~15 مرة/ثانية والقطعة ما زالت أمامها
    for (let i = 0; i < 20; i += 1) {
      clock.advance(66);
      expect(gate.accept('A')).toBeNull();
    }
  });

  it('يقبل نفس الكود مجدداً بعد انقضاء مهلة التكرار (بيع قطعتين متطابقتين)', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');
    gate.release();

    clock.advance(2300);
    expect(gate.accept('A')).toBe('A');
  });

  it('يبدأ عدّ مهلة التكرار بعد انتهاء المعالجة لا عند بدايتها', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');

    // نداء خادم بطيء استغرق أكثر من مهلة التكرار كاملةً
    clock.advance(3000);
    gate.release();

    // لولا تجديد الختم عند release لقُبل الكود فوراً وسُجّلت القطعة مرتين
    clock.advance(100);
    expect(gate.accept('A')).toBeNull();

    clock.advance(2200);
    expect(gate.accept('A')).toBe('A');
  });
});

describe('createScanGate — سرعة المسح المتتالي', () => {
  it('يقبل كوداً مختلفاً بعد فاصل قصير جداً فقط', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');
    gate.release();

    // أقصر من الفاصل الأدنى — مرفوض
    clock.advance(200);
    expect(gate.accept('B')).toBeNull();

    // تجاوزنا الفاصل الأدنى بقليل — مقبول فوراً دون انتظار مهلة التكرار
    clock.advance(250);
    expect(gate.accept('B')).toBe('B');
  });

  it('يمسح خمسة أصناف مختلفة في أقل من ثانيتين', () => {
    const clock = makeClock();
    const gate = makeGate(clock);
    const accepted = [];

    for (const code of ['A', 'B', 'C', 'D', 'E']) {
      clock.advance(420);
      const result = gate.accept(code);
      if (result) {
        accepted.push(result);
        gate.release();
      }
    }

    expect(accepted).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('createScanGate — reset', () => {
  it('يمسح تاريخ المسح فيُقبل نفس الكود فوراً بعد إعادة فتح الكاميرا', () => {
    const clock = makeClock();
    const gate = makeGate(clock);

    expect(gate.accept('A')).toBe('A');
    gate.release();
    expect(gate.accept('A')).toBeNull();

    gate.reset();
    expect(gate.isProcessing).toBe(false);
    expect(gate.accept('A')).toBe('A');
  });
});

describe('createScanGate — مهل ديناميكية', () => {
  it('يقرأ المهلة عند كل قرار حين تُمرَّر كدالة', () => {
    const clock = makeClock();
    let sameCode = 5000;
    const gate = createScanGate({
      minGapMs: () => 400,
      sameCodeCooldownMs: () => sameCode,
      now: clock.now,
    });

    expect(gate.accept('A')).toBe('A');
    gate.release();

    clock.advance(3000);
    expect(gate.accept('A')).toBeNull();   // المهلة 5000 بعد

    sameCode = 1000;                        // قُصّرت المهلة أثناء التشغيل
    expect(gate.accept('A')).toBe('A');
  });
});
