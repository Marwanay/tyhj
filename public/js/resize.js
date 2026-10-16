// Downsizes chosen photos in the browser before upload, so phone photos fit the hosting
// platform's request limit. Files the browser can't decode are left untouched.
window.ccResizeInput = function (input, { max = 2000, quality = 0.88, budget = 4.2 * 1024 * 1024 } = {}) {
  if (!input || !window.DataTransfer || !window.createImageBitmap) return;
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length || input.dataset.resizing) return;
    input.dataset.resizing = '1';
    const form = input.form, submit = form && form.querySelector('[type=submit]');
    if (submit) submit.disabled = true;
    try {
      const out = new DataTransfer();
      for (const f of files) {
        let file = f;
        try {
          const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
          const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
          if (scale < 1 || f.size > budget / Math.max(1, files.length) || !/jpe?g/i.test(f.type)) {
            const c = document.createElement('canvas');
            c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', quality));
            if (blob) file = new File([blob], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
          }
          bmp.close && bmp.close();
        } catch (e) { /* not decodable here (e.g. HEIC on some browsers) — send as is */ }
        out.items.add(file);
      }
      input.files = out.files;
      input.dispatchEvent(new CustomEvent('cc-resized', { bubbles: true }));
    } finally {
      delete input.dataset.resizing;
      if (submit) submit.disabled = false;
    }
  });
};
