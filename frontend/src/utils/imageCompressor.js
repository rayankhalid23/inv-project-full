/**
 * أداة ضغط وتصغير الصور على جهاز العميل قبل الرفع (Client-Side Image Compressor)
 * تضمن تحويل صور كاميرا الهواتف الضخمة (5MB-20MB) إلى صور خفيفة (< 200KB)
 * بأبعاد ملائمة (بحد أقصى 1200×1200) مما يمنع انقطاع الاتصال أو انتهاء المهلة على الهواتف.
 */

export const compressImageFile = async (file, maxWidth = 1200, maxHeight = 1200, quality = 0.82) => {
  if (!file || !(file instanceof File || file instanceof Blob)) {
    return file;
  }

  // إذا لم تكن الصورة من نوع صورة صالح نتخطى
  if (file.type && !file.type.startsWith('image/')) {
    return file;
  }

  // إذا كانت الصورة خفيفة جداً (أقل من 150 كيلوبايت) وكانت WebP أو JPEG يمكن إرسالها مباشرة
  if (file.size < 150 * 1024 && (file.type === 'image/webp' || file.type === 'image/jpeg')) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // حساب الأبعاد الجديدة مع الحفاظ على نسبة العرض للارتفاع
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // إذا تعذر الحصول على الـ context نُرجع الملف الأصلي كحزام أمان
          resolve(file);
          return;
        }

        // رسم الصورة بالأبعاد الجديدة
        ctx.drawImage(img, 0, 0, width, height);

        // محاولة التصدير بصيغة WebP إن كانت مدعومة، وإلا JPEG
        const outputType = 'image/webp';
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // توليد ملف File جديد بالاسم المحدّث
            const originalName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'image';
            const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
            const compressedFile = new File([blob], `${originalName}.${extension}`, {
              type: blob.type,
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          outputType,
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = event.target.result;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
};
