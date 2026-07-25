# Ondary - Real-Time Team Collaboration & Project Management System

**Ondary** adalah sistem manajemen proyek dan kolaborasi tim real-time berbasis Web & Desktop yang dikembangkan untuk **Folxcode**. Aplikasi ini dirancang untuk mempermudah alur kerja tim, pengorganisasian tugas, komunikasi langsung, serta pelacakan progress proyek secara terstruktur dan efisien.

---

## 📋 Table of Contents
- [Deskripsi Umum Project](#-deskripsi-umum-project)
- [Fitur Utama](#-fitur-utama)
- [Teknologi yang Digunakan](#-teknologi-yang-digunakan)
- [Petunjuk Instalasi & Setup (Installation & Setup Guide)](#-petunjuk-instalasi--setup-installation--setup-guide)
  - [Prasyarat Sistem](#1-prasyarat-sistem)
  - [Instalasi Dependensi](#2-instalasi-dependensi)
  - [Menjalankan Aplikasi](#3-menjalankan-aplikasi)
  - [Build & Packaging](#4-build--packaging)
- [Daftar Kontributor & Pengembang](#-daftar-kontributor--pengembang)
- [Lisensi](#-lisensi)

---

## 📝 Deskripsi Umum Project

**Ondary** diciptakan sebagai solusi manajemen proyek modern yang mendukung produktivitas dan kolaborasi tim secara real-time. Dengan integrasi antara platform web dan aplikasi desktop berbasis Electron, Ondary memberikan pengalaman pengguna yang fleksibel, cepat, dan terhubung.

Sistem ini membantu tim di **Folxcode** untuk mengelola tugas, memantau milestone, bertukar informasi secara instan melalui sistem komunikasi terintegrasi, serta melihat analitik performa tim secara visual.

---

## ✨ Fitur Utama

- 🎯 **Manajemen Proyek & Tugas**: Pembuatan, alokasi, dan pelacakan tugas tim secara terorganisir.
- ⚡ **Kolaborasi Real-Time**: Integrasi WebSocket untuk pembaruan status dan pesan secara langsung tanpa perantara.
- 💻 **Platform Ganda (Web & Desktop)**: Dijalankan dengan nyaman melalui peramban web maupun sebagai aplikasi desktop independen (Electron).
- 📊 **Analitik & Dasbor Visual**: Visualisasi perkembangan proyek dengan grafik interaktif.
- 🎨 **Antarmuka Modern & Responsif**: Dibangun menggunakan sistem komponen UI yang cepat dan elegan.

---

## 🛠️ Teknologi yang Digunakan

- **Frontend**: [Angular](https://angular.dev/) (v21)
- **Desktop Framework**: [Electron](https://www.electronjs.org/)
- **UI & Styling**: [PrimeNG](https://primeng.org/), [Tailwind CSS](https://tailwindcss.com/), Lucide Icons, GSAP
- **Real-Time Messaging**: Socket.io Client
- **Language & Build Tools**: TypeScript, Angular CLI, Electron Builder

---

## 🚀 Petunjuk Instalasi & Setup (Installation & Setup Guide)

### 1. Prasyarat Sistem

Pastikan perangkat Anda memenuhi prasyarat berikut sebelum melanjutkan:
- **Node.js**: v18.x atau versi LTS terbaru
- **npm**: v9.x atau versi lebih baru

---

### 2. Instalasi Dependensi

Kloning repository proyek ini dan pasang seluruh dependensi yang diperlukan:

```bash
# Kloning repository
git clone https://github.com/folxcode/ondary.git

# Masuk ke direktori proyek
cd ondary

# Pasang seluruh dependensi
npm install
```

---

### 3. Menjalankan Aplikasi

#### 🌐 Mode Development Web (Angular CLI)
Untuk menjalankan aplikasi versi web di server lokal:

```bash
npm start
# atau
ng serve
```
Akses aplikasi melalui peramban di [http://localhost:4200](http://localhost:4200). Halaman akan otomatis melakukan *live-reload* saat berkas sumber diubah.

#### 🖥️ Mode Development Desktop (Electron)
Untuk menjalankan aplikasi dalam mode desktop lingkungan pengujian:

```bash
npm run electron:dev
```

---

### 4. Build & Packaging

#### 📦 Build Versi Web Production
Untuk melakukan kompilasi aplikasi versi produksi web:

```bash
npm run build
```
Hasil kompilasi akan tersimpan pada direktori `dist/ondary/browser`.

#### 💻 Packaging Aplikasi Desktop
Untuk menghasilkan paket installer desktop executable (`.exe` / installer platform lainnya):

```bash
npm run package
```
Berkas hasil packaging installer akan dibuat secara otomatis di direktori `dist/` atau `release/`.

#### 🧪 Pengujian Unit (Unit Testing)
Untuk menjalankan uji fungsi otomatis:

```bash
npm test
```

---

## 👥 Daftar Kontributor & Pengembang

Project ini dikembangkan dan dikelola oleh:

| Kontributor | Role | Organisasi |
| :--- | :--- | :--- |
| **Rayyan Kheisar Syaifullah** | Lead Developer & Creator | **Folxcode** |

---

## 📄 Lisensi

Dikembangkan untuk ekosistem **Folxcode**. Seluruh hak cipta dilindungi.
