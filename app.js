// ==========================================
// SISTEM ABSENSI HYBRID + FIREBASE FIRESTORE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, doc, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

// --- KONFIGURASI FIREBASE ANDA ---
const firebaseConfig = {
    apiKey: "AIzaSyDmzBCTSPH8IgLY030UrKo0DVAMfE6_H30",
    authDomain: "absensi-belajar-malam.firebaseapp.com",
    projectId: "absensi-belajar-malam",
    storageBucket: "absensi-belajar-malam.firebasestorage.app",
    messagingSenderId: "701554843247",
    appId: "1:701554843247:web:16891ac550dcf587aab79a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let currentUserData = null;
let html5QrcodeScanner = null;
let unsubscribeDashboard = null; // Untuk mematikan real-time listener saat pindah menu

const DEFAULT_ZONES = [
    { id: "G_RIYADH", nama: "Gedung Riyadh", kode: "QR_G_RIYADH" },
    { id: "G_MADINAH", nama: "Gedung Madinah", kode: "QR_G_MADINAH" },
    { id: "MASJID", nama: "Masjid", kode: "QR_MASJID" },
    { id: "AUDITORIUM", nama: "Auditorium", kode: "QR_AUDITORIUM" }
];

// Inisialisasi Zona ke Firebase (Berjalan sekali saat awal)
async function initSystem() {
    const zoneSnap = await getDocs(collection(db, "zones"));
    if (zoneSnap.empty) {
        const batch = writeBatch(db);
        DEFAULT_ZONES.forEach(z => {
            batch.set(doc(db, "zones", z.id), z);
        });
        await batch.commit();
        console.log("Zona default berhasil dibuat di Cloud!");
    }
}

// --- 1. LOGIN SYSTEM ---
async function checkLoginStatus() {
    const loggedInUser = sessionStorage.getItem("mockUser"); // Pakai session agar aman saat tab ditutup
    if (loggedInUser) {
        currentUserData = JSON.parse(loggedInUser);
        
        document.getElementById("login-section").classList.add("hidden");
        document.getElementById("app-section").classList.remove("hidden");
        document.getElementById("user-name-display").innerText = currentUserData.nama;
        document.getElementById("welcome-name").innerText = currentUserData.nama;

        if (currentUserData.role === "ADMIN") {
            document.querySelectorAll(".admin-only").forEach(el => {
                el.classList.remove("hidden");
                el.style.display = ""; 
            });
            renderTabelGuru();
            renderManajemenZona();
        } else {
            document.querySelectorAll(".admin-only").forEach(el => {
                el.classList.add("hidden");
                el.style.display = "none"; 
            });
        }
        window.navigate('dashboard');
    } else {
        document.getElementById("login-section").classList.remove("hidden");
        document.getElementById("app-section").classList.add("hidden");
    }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;
    const errorMsg = document.getElementById("login-error");
    const btnSubmit = document.querySelector("button[type='submit']");
    
    btnSubmit.innerText = "Memeriksa ke Cloud...";
    btnSubmit.disabled = true;

    // Login Admin
    if (email === "zhelaal.one@gmail.com" && password === "2026") {
        const userData = { uid: "ADM-001", nama: "Zhela (Admin)", email: email, role: "ADMIN" };
        sessionStorage.setItem("mockUser", JSON.stringify(userData));
        btnSubmit.innerText = "Masuk ke Sistem";
        btnSubmit.disabled = false;
        checkLoginStatus();
        return;
    }

    // Login Guru (Cek ke Firebase)
    try {
        const q = query(collection(db, "guru"), where("Email", "==", email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            if (password === "123456") {
                const foundGuru = querySnapshot.docs[0].data();
                const userData = { uid: foundGuru.Barcode, nama: foundGuru.Nama, email: foundGuru.Email, zona: foundGuru.Zona, role: "GURU" };
                sessionStorage.setItem("mockUser", JSON.stringify(userData));
                checkLoginStatus();
            } else {
                errorMsg.innerText = "Password salah! (Gunakan: 123456)";
            }
        } else {
            errorMsg.innerText = "Email belum terdaftar di Cloud.";
        }
    } catch (error) {
        errorMsg.innerText = "Gagal terhubung ke server.";
        console.error(error);
    }
    
    btnSubmit.innerText = "Masuk ke Sistem";
    btnSubmit.disabled = false;
});

window.logout = () => { 
    sessionStorage.removeItem("mockUser"); 
    if(unsubscribeDashboard) unsubscribeDashboard();
    location.reload(); 
};

// --- 2. NAVIGASI (Didaftarkan ke window karena menggunakan type="module") ---
window.navigate = (pageId) => {
    if (currentUserData.role !== "ADMIN" && (pageId === "guru" || pageId === "zona" || pageId === "rekap")) return;

    document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
    const targetPage = document.getElementById(`page-${pageId}`);
    if(targetPage) targetPage.classList.remove("hidden");
    
    if (pageId !== "scan" && html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
        document.getElementById("btn-start-scan").classList.remove("hidden");
    }

    if (pageId === "scan") setupScannerUI();
    if (pageId === "dashboard") initDashboardRealtime();
    else if(unsubscribeDashboard) {
        unsubscribeDashboard(); // Matikan listener jika bukan di dashboard untuk hemat kuota
        unsubscribeDashboard = null;
    }
};

async function setupScannerUI() {
    if (!currentUserData) return;
    const adminSelector = document.getElementById("admin-zone-selector");
    const scanTitle = document.getElementById("scan-title");
    const scanDesc = document.getElementById("scan-desc");
    
    if (currentUserData.role === "ADMIN") {
        adminSelector.classList.remove("hidden");
        scanTitle.innerText = "Scan Kartu Guru (Sistem 1)";
        scanDesc.innerText = "Pilih zona tugas Anda, lalu scan Barcode/ID Card milik guru.";
        
        const select = document.getElementById("pic-zone-select");
        const zonesSnap = await getDocs(collection(db, "zones"));
        select.innerHTML = '<option value="">-- Pilih Zona Anda Bertugas --</option>';
        zonesSnap.forEach(doc => {
            select.innerHTML += `<option value="${doc.data().id}">${doc.data().nama}</option>`;
        });
    } else {
        adminSelector.classList.add("hidden");
        scanTitle.innerText = "Scan QR Zona (Sistem 2)";
        scanDesc.innerText = "Arahkan kamera ke QR Code yang terdapat di zona absensi Anda.";
    }
}

// --- 3. DASHBOARD REAL-TIME ---
function initDashboardRealtime() {
    const today = new Date().toISOString().split('T')[0];
    const q = query(collection(db, "attendance"), where("tanggal", "==", today));

    // ONSNAPSHOT = Data otomatis berubah di layar jika ada yang absen di HP lain!
    unsubscribeDashboard = onSnapshot(q, async (snapshot) => {
        let todaysData = [];
        snapshot.forEach(doc => todaysData.push(doc.data()));

        const tbody = document.getElementById("recent-attendance-body");
        if(!tbody) return;
        tbody.innerHTML = "";

        if (currentUserData.role === "ADMIN") {
            const guruSnap = await getDocs(collection(db, "guru"));
            let totalGuru = guruSnap.empty ? 1 : guruSnap.size;
            let totalHadir = todaysData.length;
            let belumHadir = totalGuru - totalHadir;
            let tepatWaktu = todaysData.filter(d => d.status === "Tepat Waktu").length;
            let terlambat = todaysData.filter(d => d.status === "Terlambat").length;

            document.getElementById("stat-total").innerText = totalGuru;
            document.getElementById("stat-hadir").innerText = totalHadir;
            document.getElementById("stat-belum").innerText = belumHadir < 0 ? 0 : belumHadir;
            document.getElementById("stat-tepat").innerText = tepatWaktu;
            document.getElementById("stat-terlambat").innerText = terlambat;

            todaysData.sort((a,b) => b.waktu.localeCompare(a.waktu)).forEach(data => {
                tbody.innerHTML += `<tr><td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td></tr>`;
            });
        } else {
            let myAttendance = todaysData.filter(d => d.email === currentUserData.email);
            if (myAttendance.length === 0) {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Anda belum absen hari ini.</td></tr>";
            } else {
                myAttendance.sort((a,b) => b.waktu.localeCompare(a.waktu)).forEach(data => {
                    tbody.innerHTML += `<tr><td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td></tr>`;
                });
            }
        }
    });
}

// --- 4. DATA GURU (IMPORT MASSAL KE CLOUD) ---
window.downloadTemplate = () => {
    const templateData = [{"No": 1, "Barcode": "187643", "Nama": "Raihan", "Tahun": "Thn 6", "Daerah": "Bima", "Kamar": "Panjimas", "Study": "Ilmu Qur'an Tafsir", "No HP": "08123456789", "Zona": "Gedung Riyadh", "Email": "ahmad.faizan@eduabsen.com"}];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Guru");
    XLSX.writeFile(wb, "Template_Import_Guru.xlsx");
};

window.handleExcelImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        let validData = [];
        jsonData.forEach(row => {
            if(row.Barcode && row.Nama && row.Zona && row.Email) {
                row["No HP"] = row["No HP"] ? row["No HP"].toString() : "-";
                row["Barcode"] = row["Barcode"].toString();
                validData.push(row);
            }
        });

        if (validData.length > 0) {
            alert("Sedang mengupload " + validData.length + " data ke server Cloud... Mohon tunggu.");
            try {
                const batch = writeBatch(db);
                validData.forEach(guru => {
                    // Gunakan Barcode sebagai ID Dokumen agar tidak ada data ganda
                    const docRef = doc(db, "guru", guru.Barcode);
                    batch.set(docRef, guru);
                });
                await batch.commit();
                alert("Berhasil! Semua data guru sudah tersimpan di Firebase.");
                renderTabelGuru();
            } catch (error) {
                alert("Gagal mengupload: " + error.message);
            }
        } else {
            alert("Data Excel kosong atau format salah.");
        }
        event.target.value = ""; 
    };
    reader.readAsArrayBuffer(file);
};

async function renderTabelGuru() {
    const tbody = document.getElementById("body-guru");
    tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Memuat data dari server...</td></tr>";
    
    const guruSnap = await getDocs(collection(db, "guru"));
    tbody.innerHTML = "";
    
    if (guruSnap.empty) return tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Belum ada data guru.</td></tr>";
    
    let idx = 1;
    guruSnap.forEach((doc) => {
        let guru = doc.data();
        tbody.innerHTML += `<tr><td>${idx++}</td><td>${guru.Barcode}</td><td>${guru.Nama}</td><td>${guru.Tahun}</td><td>${guru.Daerah}</td><td>${guru.Kamar}</td><td>${guru.Study}</td><td>${guru["No HP"]}</td><td>${guru.Zona}</td></tr>`;
    });
}

async function renderManajemenZona() {
    const grid = document.getElementById("zona-grid");
    grid.innerHTML = "Memuat zona...";
    const zonesSnap = await getDocs(collection(db, "zones"));
    grid.innerHTML = "";
    
    let zones = [];
    zonesSnap.forEach(doc => zones.push(doc.data()));

    zones.forEach(zona => {
        grid.innerHTML += `<div class="zona-card"><h4>${zona.nama}</h4><p>Kode: ${zona.kode}</p><div class="qr-container" id="qr-${zona.id}"></div></div>`;
    });
    setTimeout(() => {
        zones.forEach(zona => new QRCode(document.getElementById(`qr-${zona.id}`), {text: zona.kode, width: 128, height: 128, colorDark : "#000", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.H}));
    }, 100);
}

// --- 5. LOGIKA HYBRID SCANNER (CLOUD) ---
window.startScanner = async () => {
    document.getElementById("btn-start-scan").classList.add("hidden");
    document.getElementById("scan-result").classList.add("hidden"); 
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    
    html5QrcodeScanner.render(async (decodedText, decodedResult) => {
        html5QrcodeScanner.clear(); 
        document.getElementById("btn-start-scan").classList.remove("hidden");
        document.getElementById("btn-start-scan").innerText = "Memproses...";
        await prosesHasilScan(decodedText);
        document.getElementById("btn-start-scan").innerText = "Mulai Scan";
    }, (errorMessage) => {});
};

async function prosesHasilScan(scannedText) {
    let namaGuru, emailGuru, namaZona;

    try {
        if (currentUserData.role === "ADMIN") {
            const selectedZoneId = document.getElementById("pic-zone-select").value;
            if (!selectedZoneId) return alert("GAGAL: Pilih 'Zona Tugas Anda' di atas terlebih dahulu!");
            
            // Cari Zona
            const qZone = query(collection(db, "zones"), where("id", "==", selectedZoneId));
            const zoneSnap = await getDocs(qZone);
            if(zoneSnap.empty) return alert("Zona tidak ditemukan di server.");
            
            // Cari Guru berdasarkan Barcode
            const qGuru = query(collection(db, "guru"), where("Barcode", "==", scannedText));
            const guruSnap = await getDocs(qGuru);
            if(guruSnap.empty) return alert(`GAGAL: Guru dengan Barcode "${scannedText}" tidak terdaftar!`);
            
            namaGuru = guruSnap.docs[0].data().Nama;
            emailGuru = guruSnap.docs[0].data().Email;
            namaZona = zoneSnap.docs[0].data().nama;
            
        } else {
            // Guru Scan Zona
            const qZone = query(collection(db, "zones"), where("kode", "==", scannedText));
            const zoneSnap = await getDocs(qZone);
            if(zoneSnap.empty) return alert("GAGAL: QR Code Zona tidak valid!");
            
            namaGuru = currentUserData.nama;
            emailGuru = currentUserData.email;
            namaZona = zoneSnap.docs[0].data().nama;
        }

        const batasWaktu = "20:30";
        const now = new Date();
        const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const status = currentTimeString <= batasWaktu ? "Tepat Waktu" : "Terlambat";
        const today = now.toISOString().split('T')[0];

        // Cegah Absen Ganda di hari yang sama
        const qCek = query(collection(db, "attendance"), where("tanggal", "==", today), where("email", "==", emailGuru));
        const cekSnap = await getDocs(qCek);
        if (!cekSnap.empty) {
            return alert(`INFO: ${namaGuru} sudah melakukan absensi hari ini!`);
        }

        // Tulis Data ke Cloud
        await addDoc(collection(db, "attendance"), {
            namaGuru, email: emailGuru, namaZona, tanggal: today, waktu: currentTimeString, status, timestamp: new Date()
        });

        // Tampilkan Sukses
        const resultDiv = document.getElementById("scan-result");
        resultDiv.classList.remove("hidden");
        resultDiv.innerHTML = `<div style="background: ${status === 'Tepat Waktu' ? 'var(--primary-light)' : '#ffe6e6'}; padding: 20px; border-radius: 12px; margin-top: 20px; border-left: 4px solid ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'};"><h3 style="color: ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}">✓ Absensi Cloud Berhasil</h3><p><strong>Nama:</strong> ${namaGuru}</p><p><strong>Zona:</strong> ${namaZona}</p><p><strong>Waktu:</strong> ${currentTimeString} WIB</p><p><strong>Status:</strong> <span class="badge ${status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${status}</span></p></div>`;

    } catch (error) {
        alert("Terjadi kesalahan jaringan: " + error.message);
    }
}

setInterval(() => {
    const now = new Date();
    const timeEl = document.getElementById("current-time");
    const dateEl = document.getElementById("current-date");
    if (timeEl) timeEl.innerText = now.toLocaleTimeString('id-ID') + " WIB";
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}, 1000);

initSystem();
checkLoginStatus();
