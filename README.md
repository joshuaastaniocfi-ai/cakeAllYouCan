# Goldilocks Cake All You Can - E-Coupon & Payment Management System 🎂

A full-stack web application designed for managing ticket reservations, payments (QR Ph and Cashier Cash payments), verification workflows, automated high-resolution e-coupon generation, and transactional Gmail delivery with calendar invites for the **Goldilocks Cake All You Can** event.

---

## 🌟 Key Features

- **Customer E-Coupon Registration & Pass Generator:**
  - Modern, responsive mobile & desktop UI matching Goldilocks branding.
  - Interactive Terms & Conditions modal with mandatory scroll-to-agree logic.
  - Multi-payment support:
    - **QR Ph / GCash / Maya:** Receipt screenshot upload with automated verification queue.
    - **Cash at Cashier:** On-the-spot verification using 6-digit secure cashier authorization codes.
- **Dynamic Anti-Tamper E-Coupon Generator:**
  - Powered by Python Pillow (PIL) and Node.js.
  - Dynamically imprints customer name, branch, event date/time, and authentic high-visibility overlay badge for the unique Control Number (`CAYCxxxx`).
  - QR Code generation embedded directly onto the pass for on-site scanning.
- **Automated Transactional Email & Calendar Integration:**
  - Dispatches high-resolution coupon PNG pass directly to customer's Gmail upon approval.
  - Includes a one-click **"Add to Google Calendar"** button preconfigured with event time and venue details.
- **Cashier & Admin Control Dashboard:**
  - Live statistics: Total registrations, pending receipts, approved passes, declined requests.
  - Searchable transaction table with full modal preview of uploaded payment slips.
  - Batch / Single-click approval that automatically issues the coupon and triggers email delivery.
  - Cashier Authorization Code management table.
- **Cloud-Ready Containerization:**
  - Production `Dockerfile` bundling Node.js 20, Python 3, and Pillow for seamless deployment on cloud platforms (Railway, Render, Fly.io, AWS, DigitalOcean).

---

## 🏗️ Tech Stack

- **Backend:** Node.js, Express.js, Mongoose (MongoDB Atlas)
- **Image Processing:** Python 3, Pillow (PIL), QRCode
- **Email Delivery:** Nodemailer (Gmail SMTP with App Passwords)
- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+), SweetAlert2, Feather Icons
- **Deployment:** Docker, Node.js 18+

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v18 or higher
- **Python** 3.8+ with `Pillow` and `qrcode`
  ```bash
  pip install pillow qrcode
  ```
- **MongoDB Atlas** cluster or local MongoDB instance

### 2. Installation
Clone the repository:
```bash
git clone https://github.com/joshuaastaniocfi-ai/cakeAllYouCan.git
cd cakeAllYouCan
```

Install Node dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Update `.env` with your credentials:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/goldilocks_ecoupon?retryWrites=true&w=majority
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_16_char_google_app_password
BASE_URL=http://localhost:3000
ADMIN_USERNAME=admin@123
ADMIN_PASSWORD=@cakeallyoucan2026
```

### 4. Database Seeding (Optional)
To seed initial Cashier Authorization codes:
```bash
node seed.js
```

### 5. Running the Application
Development / Production:
```bash
npm start
```
The application will be accessible at:
- **Customer Portal:** `http://localhost:3000`
- **Admin Dashboard:** `http://localhost:3000/admin.html`

---

## 🐳 Docker Deployment

Build and run using Docker:
```bash
# Build image
docker build -t cake-all-you-can .

# Run container
docker run -d -p 3000:3000 --env-file .env --name cake-app cake-all-you-can
```

---

## 📄 License
This project is licensed under the ISC License.

