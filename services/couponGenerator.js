const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

function generateCouponImage(guestName, controlNo) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate_coupon_image.py');
    const outputDir = path.join(__dirname, '..', 'uploads', 'coupons');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, `coupon-${controlNo}.png`);

    const pythonBin = process.platform === 'win32' ? 'python' : (fs.existsSync('/usr/bin/python') ? 'python' : 'python3');
    execFile(pythonBin, [scriptPath, guestName, controlNo, outputPath], (error, stdout, stderr) => {
      if (error) {
        console.error('Error generating coupon image:', error, stderr);
        return reject(error);
      }
      resolve(outputPath);
    });
  });
}

module.exports = {
  generateCouponImage
};

