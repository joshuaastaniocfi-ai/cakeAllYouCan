const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'goldilocks-ecoupon.html');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update HTML for QR download button & img
const oldQrHtml = `<div class="qrph-card-display">
        <div class="qrph-img-wrap">
          <img src="Assets/goldilocks-qrph.png" alt="Goldilocks QRPh Payment Code" id="qrphDisplayImg" />
        </div>
        <div style="margin-top:8px;">
          <a href="Assets/goldilocks-qrph.png" download="Goldilocks-CakeAllYouCan-QRPh.png" class="btn btn-secondary btn-full" style="font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;">
            ⬇ Download QRPh Code to Gallery
          </a>
        </div>
      </div>`;

const newQrHtml = `<div class="qrph-card-display">
        <div class="qrph-img-wrap">
          <img src="Assets/goldilocks-qrph.png" alt="Goldilocks QRPh Payment Code" id="qrphDisplayImg" style="cursor:pointer;" title="Tap or click to download QR code" />
        </div>
        <div style="margin-top:8px;">
          <a href="/api/download-qr" id="btnDownloadQr" download="Goldilocks-CakeAllYouCan-QRPh.png" class="btn btn-secondary btn-full" style="font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
            ⬇ Download QRPh Code to Gallery
          </a>
        </div>
      </div>`;

if (content.includes(oldQrHtml)) {
  content = content.replace(oldQrHtml, newQrHtml);
  console.log('1. Updated QR HTML with ID and pointer cursor');
}

// 2. Add JavaScript download handler right before Track Reservation
const jsMarker = '      /* ---------- Track Reservation & Download Coupon Handling ---------- */';

const qrDownloadJs = `      /* ---------- Automatic Download QRPh Code ---------- */
      const btnDownloadQr = $('#btnDownloadQr');
      const qrphDisplayImg = $('#qrphDisplayImg');

      async function triggerQrDownload(e) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        try {
          const resp = await fetch('/Assets/goldilocks-qrph.png');
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = 'Goldilocks-CakeAllYouCan-QRPh.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
          toast('⬇ QR code downloaded to your device!');
        } catch (err) {
          window.location.href = '/api/download-qr';
        }
      }

      if (btnDownloadQr) {
        btnDownloadQr.addEventListener('click', triggerQrDownload);
      }
      if (qrphDisplayImg) {
        qrphDisplayImg.addEventListener('click', triggerQrDownload);
      }

`;

if (!content.includes('triggerQrDownload')) {
  content = content.replace(jsMarker, qrDownloadJs + jsMarker);
  console.log('2. Injected automatic QR download handler');
}

// 3. Verify script syntax
const scriptStart = content.lastIndexOf('<script>') + 8;
const scriptEnd = content.lastIndexOf('</script>');
const script = content.substring(scriptStart, scriptEnd);

try {
  new Function(script);
  console.log('Script syntax verified 100% OK!');
} catch (err) {
  console.error('Syntax error:', err);
  process.exit(1);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated goldilocks-ecoupon.html for automatic QR download!');

