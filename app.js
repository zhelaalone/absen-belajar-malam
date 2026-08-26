// ==========================================
// SISTEM ABSENSI HYBRID + FIREBASE + QOBLIYAH/BAKDIYAH FLEXIBLE
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, doc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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
let unsubscribeDashboard = null; 
let unsubscribeSession = null;
let activeSessionData = null; 

const DEFAULT_ZONES = [
    { id: "G_RIYADH", nama: "Gedung Riyadh", kode: "QR_G_RIYADH" },
    { id: "G_MADINAH", nama: "Gedung Madinah", kode: "QR_G_MADINAH" },
    { id: "MASJID", nama: "Masjid", kode: "QR_MASJID" },
    { id: "AUDITORIUM", nama: "Auditorium", kode: "QR_AUDITORIUM" }
];

async function initSystem() {
    const zoneSnap = await getDocs(collection(db, "zones"));
    if (zoneSnap.empty) {
        const batch = writeBatch(db);
        DEFAULT_ZONES.forEach(z => batch.set(doc(db, "zones", z.id), z));
        await batch.commit();
    }
}

// --- 1. LOGIN SYSTEM & HAK AKSES ---
async function checkLoginStatus() {
    const loggedInUser = sessionStorage.getItem("mockUser");
    if (loggedInUser) {
        currentUserData = JSON.parse(loggedInUser);
        
        // BUG FIX ABSOLUTE: Paksa menu login lenyap menggunakan flag !important
        const loginSec = document.getElementById("login-section");
        loginSec.classList.remove("active");
        loginSec.classList.add("hidden");
        loginSec.style.setProperty("display", "none", "important"); // Lapis kedua pelindung

        const appSec = document.getElementById("app-section");
        appSec.classList.remove("hidden");
        appSec.style.setProperty("display", "block", "important");

        document.getElementById("user-name-display").innerText = currentUserData.nama;
        document.getElementById("welcome-name").innerText = currentUserData.nama;

        if (currentUserData.role === "ADMIN") {
            document.querySelectorAll(".admin-only").forEach(el => { el.classList.remove("hidden"); el.style.display = ""; });
            
            if (currentUserData.email === "zhelaal.one@gmail.com") {
                document.querySelectorAll(".super-admin-only").forEach(el => { el.classList.remove("hidden"); el.style.display = ""; });
            } else {
                document.querySelectorAll(".super-admin-only").forEach(el => { el.classList.add("hidden"); el.style.display = "none"; });
            }
            renderTabelGuru();
            renderManajemenZona();
        } else {
            document.querySelectorAll(".admin-only, .super-admin-only").forEach(el => { el.classList.add("hidden"); el.style.display = "none"; });
        }
        
        listenToActiveSession(); 
        window.navigate('dashboard');
    } else {
        const loginSec = document.getElementById("login-section");
        loginSec.classList.remove("hidden");
        loginSec.style.setProperty("display", "flex", "important");
        
        const appSec = document.getElementById("app-section");
        appSec.classList.add("hidden");
        appSec.style.setProperty("display", "none", "important");
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

    try {
        if (password === "2026") {
            if (email === "zhelaal.one@gmail.com") {
                const userData = { uid: "ADM-SUPER", nama: "Zhela (Super Admin)", email: email, role: "ADMIN" };
                sessionStorage.setItem("mockUser", JSON.stringify(userData));
                btnSubmit.innerText = "Masuk ke Sistem"; btnSubmit.disabled = false;
                checkLoginStatus(); return;
            } else {
                const qAdmin = query(collection(db, "admins"), where("email", "==", email));
                const adminSnap = await getDocs(qAdmin);
                if (!adminSnap.empty) {
                    const adminData = adminSnap.docs[0].data();
                    const userData = { uid: "ADM-STAFF", nama: adminData.nama || "Admin Staff", email: email, role: "ADMIN" };
                    sessionStorage.setItem("mockUser", JSON.stringify(userData));
                    btnSubmit.innerText = "Masuk ke Sistem"; btnSubmit.disabled = false;
                    checkLoginStatus(); return;
                } else {
                    errorMsg.innerText = "Email ini tidak terdaftar sebagai Admin!";
                }
            }
        } else {
            const q = query(collection(db, "guru"), where("Email", "==", email));
            const querySnapshot = await getDocs(q);
            if (!querySnapshot.empty) {
                if (password === "123456") {
                    const foundGuru = querySnapshot.docs[0].data();
                    const userData = { uid: foundGuru.Barcode, nama: foundGuru.Nama, email: foundGuru.Email, zona: foundGuru.Zona, role: "GURU" };
                    sessionStorage.setItem("mockUser", JSON.stringify(userData));
                    checkLoginStatus(); return; 
                } else {
                    errorMsg.innerText = "Password salah! (Guru: 123456 | Admin: 2026)";
                }
            } else {
                errorMsg.innerText = "Email belum terdaftar di Cloud.";
            }
        }
    } catch (error) { errorMsg.innerText = "Gagal terhubung ke server."; }
    
    btnSubmit.innerText = "Masuk ke Sistem"; btnSubmit.disabled = false;
});

window.logout = () => { 
    sessionStorage.removeItem("mockUser"); 
    if(unsubscribeDashboard) unsubscribeDashboard();
    if(unsubscribeSession) unsubscribeSession();
    location.reload(); 
};

// --- 2. NAVIGASI ---
window.navigate = (pageId) => {
    if (currentUserData.role !== "ADMIN" && (pageId === "guru" || pageId === "zona" || pageId === "rekap" || pageId === "setting")) return;
    if (pageId === "setting" && currentUserData.email !== "zhelaal.one@gmail.com") return alert("Akses Ditolak! Hanya Developer yang bisa membuka menu ini.");

    document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
    const targetPage = document.getElementById(`page-${pageId}`);
    if(targetPage) targetPage.classList.remove("hidden");
    
    if (pageId !== "scan" && html5QrcodeScanner) {
        html5QrcodeScanner.clear(); html5QrcodeScanner = null;
        document.getElementById("btn-start-scan").classList.remove("hidden");
    }

    if (pageId === "scan") setupScannerUI();
    if (pageId === "rekap" && currentUserData.role === "ADMIN") renderRekap();
    if (pageId === "setting" && currentUserData.email === "zhelaal.one@gmail.com") renderDaftarAdmin();
    if (pageId === "dashboard") initDashboardRealtime();
    else if(unsubscribeDashboard) { unsubscribeDashboard(); unsubscribeDashboard = null; }
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
        zonesSnap.forEach(doc => { select.innerHTML += `<option value="${doc.data().id}">${doc.data().nama}</option>`; });
    } else {
        adminSelector.classList.add("hidden");
        scanTitle.innerText = "Scan QR Zona (Sistem 2)";
        scanDesc.innerText = "Arahkan kamera ke QR Code yang terdapat di zona absensi Anda.";
    }
}

// --- 3. FITUR TAMBAH ADMIN DENGAN NAMA ---
window.tambahAdmin = async () => {
    if (currentUserData.email !== "zhelaal.one@gmail.com") return alert("Akses Ditolak!");
    
    const namaBaru = document.getElementById("input-new-admin-nama").value.trim();
    const emailBaru = document.getElementById("input-new-admin").value.trim();
    
    if(!namaBaru || !emailBaru) return alert("Nama dan Email tidak boleh kosong!");
    if(emailBaru === "zhelaal.one@gmail.com") return alert("Email ini otomatis sudah menjadi Super Admin!");

    document.querySelector("#page-setting .btn-primary").innerText = "Menyimpan...";
    try {
        const q = query(collection(db, "admins"), where("email", "==", emailBaru));
        const snap = await getDocs(q);
        if(!snap.empty) {
            document.querySelector("#page-setting .btn-primary").innerText = "Tambah Admin";
            return alert("Gagal: Email ini sudah terdaftar sebagai Admin!");
        }

        await addDoc(collection(db, "admins"), { nama: namaBaru, email: emailBaru, role: "ADMIN", timestamp: new Date() });
        alert(`SUKSES! Admin ${namaBaru} (${emailBaru}) berhasil ditambahkan.\nInformasikan ke mereka untuk login dengan Password: 2026`);
        
        document.getElementById("input-new-admin-nama").value = "";
        document.getElementById("input-new-admin").value = "";
        renderDaftarAdmin(); 
    } catch (error) { alert("Gagal menambah admin: " + error.message); }
    document.querySelector("#page-setting .btn-primary").innerText = "Tambah Admin";
};

async function renderDaftarAdmin() {
    const tbody = document.getElementById("body-daftar-admin");
    tbody.innerHTML = `<tr><td style="padding: 10px;"><strong>Zhela (Super Admin)</strong></td><td style="padding: 10px;">zhelaal.one@gmail.com</td><td style="padding: 10px;"><span class="badge badge-tepat" style="background:#4f46e5; color:#fff;">Developer</span></td></tr>`;
    try {
        const snap = await getDocs(collection(db, "admins"));
        snap.forEach(doc => {
            let data = doc.data();
            tbody.innerHTML += `<tr><td style="padding: 10px;"><strong>${data.nama || "Admin Staff"}</strong></td><td style="padding: 10px;">${data.email}</td><td style="padding: 10px;"><span class="badge" style="background:#eef2ff; color:#4f46e5;">Admin Staff</span></td></tr>`;
        });
    } catch (error) { console.error(error); }
}

// --- 4. MANAJEMEN SESI (KEGIATAN & TAHAP) ---
function listenToActiveSession() {
    unsubscribeSession = onSnapshot(doc(db, "settings", "current_session"), (docSnap) => {
        const statusSesiGuru = document.getElementById("lbl-status-sesi-guru");
        
        if (docSnap.exists() && docSnap.data().isActive) {
            activeSessionData = docSnap.data();
            if (currentUserData.role === "ADMIN") {
                document.getElementById("form-buka-sesi").style.display = "none";
                document.getElementById("info-sesi-aktif").classList.remove("hidden");
                document.getElementById("lbl-nama-kegiatan").innerText = activeSessionData.namaKegiatan;
                document.getElementById("lbl-tipe-sesi").innerText = activeSessionData.tipeSesi;
                document.getElementById("lbl-batas-jam").innerText = activeSessionData.batasWaktu;
                document.getElementById("lbl-admin-sesi").innerText = activeSessionData.adminNama;
            }
            statusSesiGuru.innerText = `(Sesi Aktif: ${activeSessionData.namaKegiatan} - ${activeSessionData.tipeSesi})`;
            statusSesiGuru.style.backgroundColor = "var(--primary-light)";
            statusSesiGuru.style.color = "var(--primary)";
        } else {
            activeSessionData = null;
            if (currentUserData.role === "ADMIN") {
                document.getElementById("form-buka-sesi").style.display = "grid";
                document.getElementById("info-sesi-aktif").classList.add("hidden");
            }
            statusSesiGuru.innerText = "(Belum ada sesi absensi yang dimulai)";
            statusSesiGuru.style.backgroundColor = "#ffe6e6";
            statusSesiGuru.style.color = "var(--danger)";
        }
        
        if (document.getElementById("page-dashboard").classList.contains("active")) initDashboardRealtime(); 
    });
}

window.mulaiSesi = async () => {
    const namaKegiatan = document.getElementById("input-nama-kegiatan").value.trim();
    const tipeSesi = document.getElementById("input-tipe-sesi").value;
    const batasWaktu = document.getElementById("input-batas-jam").value;
    
    if(!namaKegiatan || !batasWaktu) return alert("Mohon isi 'Nama Kegiatan' dan 'Batas Jam'!");

    try {
        await setDoc(doc(db, "settings", "current_session"), {
            namaKegiatan: namaKegiatan,
            tipeSesi: tipeSesi,
            batasWaktu: batasWaktu,
            adminNama: currentUserData.nama,
            tanggal: new Date().toISOString().split('T')[0],
            isActive: true,
            timestamp: new Date()
        });
        document.getElementById("input-nama-kegiatan").value = "";
        document.getElementById("input-tipe-sesi").selectedIndex = 0;
        document.getElementById("input-batas-jam").value = "";
    } catch (error) { alert("Gagal memulai sesi: " + error.message); }
};

window.tutupSesi = async () => {
    if(confirm("Yakin ingin menutup sesi ini? (Guru tidak akan bisa absen lagi sampai ada sesi baru).")) {
        await setDoc(doc(db, "settings", "current_session"), { isActive: false }, { merge: true });
    }
};

// --- 5. DASHBOARD REAL-TIME ---
function initDashboardRealtime() {
    if (unsubscribeDashboard) unsubscribeDashboard();
    const tbody = document.getElementById("recent-attendance-body");
    
    if (!activeSessionData) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:30px;'>Belum ada sesi absensi yang dimulai hari ini.</td></tr>";
        document.getElementById("stat-total").innerText = "0"; document.getElementById("stat-hadir").innerText = "0";
        document.getElementById("stat-belum").innerText = "0"; document.getElementById("stat-tepat").innerText = "0";
        document.getElementById("stat-terlambat").innerText = "0";
        return;
    }

    const q = query(collection(db, "attendance"), where("tanggal", "==", activeSessionData.tanggal));
    unsubscribeDashboard = onSnapshot(q, async (snapshot) => {
        let todaysData = [];
        snapshot.forEach(doc => {
            let d = doc.data();
            if(d.namaKegiatan === activeSessionData.namaKegiatan && d.tipeSesi === activeSessionData.tipeSesi) {
                todaysData.push(d);
            }
        });
        tbody.innerHTML = "";

        if (currentUserData.role === "ADMIN") {
            const guruSnap = await getDocs(collection(db, "guru"));
            let totalGuru = guruSnap.empty ? 1 : guruSnap.size;
            let totalHadir = todaysData.length;
            let belumHadir = totalGuru - totalHadir;
            document.getElementById("stat-total").innerText = totalGuru;
            document.getElementById("stat-hadir").innerText = totalHadir;
            document.getElementById("stat-belum").innerText = belumHadir < 0 ? 0 : belumHadir;
            document.getElementById("stat-tepat").innerText = todaysData.filter(d => d.status === "Tepat Waktu").length;
            document.getElementById("stat-terlambat").innerText = todaysData.filter(d => d.status === "Terlambat").length;

            if(todaysData.length === 0) tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Belum ada yang hadir pada sesi ini.</td></tr>";
            todaysData.sort((a,b) => b.waktu.localeCompare(a.waktu)).forEach(data => {
                tbody.innerHTML += `<tr><td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td></tr>`;
            });
        } else {
            let myAttendance = todaysData.filter(d => d.email === currentUserData.email);
            if (myAttendance.length === 0) {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Anda belum absen untuk sesi ini.</td></tr>";
            } else {
                myAttendance.sort((a,b) => b.waktu.localeCompare(a.waktu)).forEach(data => {
                    tbody.innerHTML += `<tr><td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td></tr>`;
                });
            }
        }
    });
}

// --- 6. LOGIKA HYBRID SCANNER (CLOUD) ---
window.startScanner = async () => {
    if (!activeSessionData) return alert("GAGAL: Admin belum memulai sesi absensi apapun!");
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
            if (!selectedZoneId) return alert("GAGAL: Pilih 'Zona Tugas Anda' terlebih dahulu!");
            
            const qZone = query(collection(db, "zones"), where("id", "==", selectedZoneId));
            const zoneSnap = await getDocs(qZone);
            if(zoneSnap.empty) return alert("Zona tidak ditemukan.");
            
            const qGuru = query(collection(db, "guru"), where("Barcode", "==", scannedText));
            const guruSnap = await getDocs(qGuru);
            if(guruSnap.empty) return alert(`GAGAL: Barcode "${scannedText}" tidak terdaftar!`);
            
            namaGuru = guruSnap.docs[0].data().Nama;
            emailGuru = guruSnap.docs[0].data().Email;
            namaZona = zoneSnap.docs[0].data().nama;
        } else {
            const qZone = query(collection(db, "zones"), where("kode", "==", scannedText));
            const zoneSnap = await getDocs(qZone);
            if(zoneSnap.empty) return alert("GAGAL: QR Code Zona tidak valid!");
            
            namaGuru = currentUserData.nama;
            emailGuru = currentUserData.email;
            namaZona = zoneSnap.docs[0].data().nama;
        }

        const now = new Date();
        const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const status = currentTimeString <= activeSessionData.batasWaktu ? "Tepat Waktu" : "Terlambat";
        
        const tanggalSQL = now.toISOString().split('T')[0];
        const hariIndo = now.toLocaleDateString('id-ID', { weekday: 'long' });
        const tanggalIndo = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        // CEK ABSEN GANDA: Tanggal sama + Email sama + Kegiatan sama + Tahap Sama
        const qCek = query(collection(db, "attendance"), where("tanggal", "==", tanggalSQL), where("email", "==", emailGuru));
        const cekSnap = await getDocs(qCek);
        let sudahAbsen = false;
        cekSnap.forEach(doc => {
            let d = doc.data();
            if(d.namaKegiatan === activeSessionData.namaKegiatan && d.tipeSesi === activeSessionData.tipeSesi) sudahAbsen = true;
        });

        if (sudahAbsen) return alert(`INFO: ${namaGuru} sudah tercatat hadir pada Tahap ${activeSessionData.tipeSesi} acara "${activeSessionData.namaKegiatan}".`);

        await addDoc(collection(db, "attendance"), {
            namaGuru, email: emailGuru, namaZona, waktu: currentTimeString, status, tanggal: tanggalSQL, hariStr: hariIndo, tanggalStr: tanggalIndo, 
            namaKegiatan: activeSessionData.namaKegiatan, 
            tipeSesi: activeSessionData.tipeSesi, 
            adminPenanggungJawab: activeSessionData.adminNama, 
            timestamp: now.getTime()
        });

        const resultDiv = document.getElementById("scan-result");
        resultDiv.classList.remove("hidden");
        resultDiv.innerHTML = `<div style="background: ${status === 'Tepat Waktu' ? 'var(--primary-light)' : '#ffe6e6'}; padding: 20px; border-radius: 12px; margin-top: 20px; border-left: 4px solid ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'};"><h3 style="color: ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}">✓ Absensi Berhasil</h3><p><strong>Nama:</strong> ${namaGuru}</p><p><strong>Zona:</strong> ${namaZona}</p><p><strong>Acara:</strong> ${activeSessionData.namaKegiatan} (${activeSessionData.tipeSesi})</p><p><strong>Waktu:</strong> ${currentTimeString} WIB</p><p><strong>Status:</strong> <span class="badge ${status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${status}</span></p></div>`;
    } catch (error) { alert("Terjadi kesalahan jaringan: " + error.message); }
}

// --- 7. DATA GURU (IMPORT) & REKAP ---
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
            alert("Sedang mengupload " + validData.length + " data...");
            try {
                const batch = writeBatch(db);
                validData.forEach(guru => batch.set(doc(db, "guru", guru.Barcode), guru));
                await batch.commit();
                alert("Berhasil mengupload ke server.");
                renderTabelGuru();
            } catch (error) { alert("Gagal mengupload: " + error.message); }
        }
        event.target.value = ""; 
    };
    reader.readAsArrayBuffer(file);
};

async function renderTabelGuru() {
    const tbody = document.getElementById("body-guru");
    tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Memuat...</td></tr>";
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

// FUNGSI REKAP
async function renderRekap() {
    const tbody = document.getElementById("body-rekap");
    tbody.innerHTML = "<tr><td colspan='8' style='text-align:center;'>Memuat riwayat dari server Cloud...</td></tr>";
    try {
        const snap = await getDocs(collection(db, "attendance"));
        let dataRekap = [];
        snap.forEach(doc => dataRekap.push(doc.data()));
        dataRekap.sort((a, b) => b.timestamp - a.timestamp);
        
        tbody.innerHTML = "";
        if (dataRekap.length === 0) return tbody.innerHTML = "<tr><td colspan='8' style='text-align:center;'>Belum ada riwayat absen.</td></tr>";

        dataRekap.forEach(d => {
            tbody.innerHTML += `<tr><td><strong>${d.hariStr}</strong>, ${d.tanggalStr}</td><td>${d.waktu}</td><td><strong>${d.namaKegiatan}</strong></td><td><span style="background:#eef2ff; color:#4f46e5; padding:3px 8px; border-radius:4px; font-size:0.85rem;">${d.tipeSesi}</span></td><td><strong>${d.namaGuru}</strong></td><td>${d.namaZona}</td><td><span class="badge ${d.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${d.status}</span></td><td>${d.adminPenanggungJawab}</td></tr>`;
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan='8' style='text-align:center; color:red;'>Gagal memuat: ${error.message}</td></tr>`;
    }
}

window.exportRekapToExcel = async () => {
    try {
        const snap = await getDocs(collection(db, "attendance"));
        let dataRekap = [];
        snap.forEach(doc => dataRekap.push(doc.data()));
        dataRekap.sort((a, b) => b.timestamp - a.timestamp); 

        let dataExport = dataRekap.map((d, index) => ({
            "No": index + 1, "Hari": d.hariStr, "Tanggal": d.tanggalStr, "Jam Absen": d.waktu, "Nama Kegiatan": d.namaKegiatan, "Tahap Absensi": d.tipeSesi, "Nama Guru": d.namaGuru, "Zona": d.namaZona, "Status": d.status, "Admin Bertugas": d.adminPenanggungJawab
        }));

        const ws = XLSX.utils.json_to_sheet(dataExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
        XLSX.writeFile(wb, "Rekap_EduAbsen.xlsx");
    } catch (error) { alert("Gagal export: " + error.message); }
};

setInterval(() => {
    const now = new Date();
    const timeEl = document.getElementById("current-time");
    const dateEl = document.getElementById("current-date");
    if (timeEl) timeEl.innerText = now.toLocaleTimeString('id-ID') + " WIB";
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}, 1000);

initSystem();
checkLoginStatus();
