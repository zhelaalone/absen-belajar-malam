// ==========================================
// SISTEM ABSENSI HYBRID + FIREBASE + QOBLIYAH/BAKDIYAH + LIVE FILTER + POPUP STATUS
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, onSnapshot, query, where, doc, setDoc, writeBatch, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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

let allRekapData = []; 
let filteredRekapData = [];
let currentEditIndex = -1; // Variabel penyimpan baris yang sedang diedit di modal

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
        
        const loginSec = document.getElementById("login-section");
        loginSec.classList.remove("active");
        loginSec.classList.add("hidden");
        loginSec.style.setProperty("display", "none", "important"); 

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
    
    // Hentikan kamera jika pindah halaman
    if (pageId !== "scan" && typeof window.stopScanner === "function") {
        window.stopScanner();
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

// --- 3. FITUR TAMBAH, EDIT, & HAPUS ADMIN ---
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
        alert(`SUKSES! Admin ${namaBaru} (${emailBaru}) berhasil ditambahkan.`);
        
        document.getElementById("input-new-admin-nama").value = "";
        document.getElementById("input-new-admin").value = "";
        renderDaftarAdmin(); 
    } catch (error) { alert("Gagal menambah admin: " + error.message); }
    document.querySelector("#page-setting .btn-primary").innerText = "Tambah Admin";
};

window.hapusAdmin = async (id, nama) => {
    if (currentUserData.email !== "zhelaal.one@gmail.com") return alert("Akses Ditolak!");
    if (confirm(`Peringatan: Yakin ingin MENGHAPUS akses admin untuk "${nama}"?`)) {
        try {
            await deleteDoc(doc(db, "admins", id));
            alert(`Akses admin untuk ${nama} berhasil dicabut.`);
            renderDaftarAdmin(); 
        } catch (error) { alert("Gagal menghapus admin: " + error.message); }
    }
};

window.editAdmin = async (id, namaLama, emailLama) => {
    if (currentUserData.email !== "zhelaal.one@gmail.com") return alert("Akses Ditolak!");
    
    const namaBaru = prompt("Ubah Nama Admin:", namaLama);
    if (namaBaru === null) return; 
    
    const emailBaru = prompt("Ubah Email Akses Admin:", emailLama);
    if (emailBaru === null) return; 

    if (!namaBaru.trim() || !emailBaru.trim()) return alert("Nama dan Email tidak boleh kosong!");

    try {
        if (emailBaru.trim() !== emailLama) {
            const q = query(collection(db, "admins"), where("email", "==", emailBaru.trim()));
            const snap = await getDocs(q);
            if (!snap.empty) return alert("Gagal: Email yang baru Anda masukkan sudah dipakai oleh admin lain!");
        }
        await updateDoc(doc(db, "admins", id), { nama: namaBaru.trim(), email: emailBaru.trim() });
        alert(`SUKSES: Data admin berhasil diperbarui.`);
        renderDaftarAdmin(); 
    } catch (error) { alert("Gagal mengedit admin: " + error.message); }
};

async function renderDaftarAdmin() {
    const tbody = document.getElementById("body-daftar-admin");
    tbody.innerHTML = `<tr>
        <td style="padding: 10px;"><strong>Zhela (Super Admin)</strong></td>
        <td style="padding: 10px;">zhelaal.one@gmail.com</td>
        <td style="padding: 10px;"><span class="badge badge-tepat" style="background:#4f46e5; color:#fff;">Developer</span></td>
        <td style="padding: 10px;"><span style="color:#9ca3af; font-size:0.8rem; font-style:italic;">Akses Mutlak</span></td>
    </tr>`;
    
    try {
        const snap = await getDocs(collection(db, "admins"));
        snap.forEach(doc => {
            let data = doc.data();
            let adminId = doc.id; 
            tbody.innerHTML += `<tr>
                <td style="padding: 10px;"><strong>${data.nama || "Admin Staff"}</strong></td>
                <td style="padding: 10px;">${data.email}</td>
                <td style="padding: 10px;"><span class="badge" style="background:#eef2ff; color:#4f46e5;">Admin Staff</span></td>
                <td style="padding: 10px;">
                    <button onclick="editAdmin('${adminId}', '${data.nama}', '${data.email}')" style="background:#f59e0b; color:#fff; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.75rem; margin-right:4px;">Edit</button>
                    <button onclick="hapusAdmin('${adminId}', '${data.nama}')" style="background:#dc2626; color:#fff; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:0.75rem;">Hapus</button>
                </td>
            </tr>`;
        });
    } catch (error) { console.error(error); }
}

// --- 4. MANAJEMEN SESI ---
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
            // HANYA tarik data yang sesinya cocok DAN statusnya Tepat Waktu / Terlambat
            if(d.namaKegiatan === activeSessionData.namaKegiatan && 
               d.tipeSesi === activeSessionData.tipeSesi &&
               (d.status === "Tepat Waktu" || d.status === "Terlambat")) {
                todaysData.push(d);
            }
        });
        tbody.innerHTML = "";

        if (currentUserData.role === "ADMIN") {
            const guruSnap = await getDocs(collection(db, "guru"));
            let totalGuru = guruSnap.empty ? 1 : guruSnap.size;
            let totalHadir = todaysData.length;
            let belumHadir = totalGuru - totalHadir; // Belum hadir fisik
            
            document.getElementById("stat-total").innerText = totalGuru;
            document.getElementById("stat-hadir").innerText = totalHadir;
            document.getElementById("stat-belum").innerText = belumHadir < 0 ? 0 : belumHadir;
            document.getElementById("stat-tepat").innerText = todaysData.filter(d => d.status === "Tepat Waktu").length;
            document.getElementById("stat-terlambat").innerText = todaysData.filter(d => d.status === "Terlambat").length;

            if(todaysData.length === 0) {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Belum ada yang hadir pada sesi ini.</td></tr>";
            } else {
                // Urutkan berdasarkan waktu scan terbaru (timestamp)
                todaysData.sort((a,b) => b.timestamp - a.timestamp).forEach(data => {
                    let badgeStyle = data.status === 'Tepat Waktu' ? "background:#d1fae5; color:#059669;" : "background:#ffedd5; color:#ea580c;";
                    
                    tbody.innerHTML += `<tr>
                        <td><strong>${data.namaGuru}</strong></td>
                        <td>${data.namaZona}</td>
                        <td>${data.waktu}</td>
                        <td><span class="badge" style="${badgeStyle}">${data.status}</span></td>
                    </tr>`;
                });
            }
        } else {
            let myAttendance = todaysData.filter(d => d.email === currentUserData.email);
            if (myAttendance.length === 0) {
                tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Anda belum absen untuk sesi ini.</td></tr>";
            } else {
                myAttendance.sort((a,b) => b.timestamp - a.timestamp).forEach(data => {
                    let badgeStyle = data.status === 'Tepat Waktu' ? "background:#d1fae5; color:#059669;" : "background:#ffedd5; color:#ea580c;";

                    tbody.innerHTML += `<tr>
                        <td><strong>${data.namaGuru}</strong></td>
                        <td>${data.namaZona}</td>
                        <td>${data.waktu}</td>
                        <td><span class="badge" style="${badgeStyle}">${data.status}</span></td>
                    </tr>`;
                });
            }
        }
    });
}

// --- 6. LOGIKA HYBRID SCANNER CONTINUOUS (TANPA HENTI) ---
let isProcessingScan = false;
let lastScannedText = "";
let lastScannedTime = 0;

window.startScanner = async () => {
    if (!activeSessionData) return alert("GAGAL: Admin belum memulai sesi absensi apapun!");
    
    if (currentUserData.role === "ADMIN") {
        const selectedZoneId = document.getElementById("pic-zone-select").value;
        if (!selectedZoneId) return alert("GAGAL: Pilih 'Zona Tugas Anda' terlebih dahulu!");
    }

    document.getElementById("btn-start-scan").classList.add("hidden");
    document.getElementById("scan-result").classList.remove("hidden"); 
    document.getElementById("scan-result").innerHTML = "<div style='text-align:center; padding:15px; color:#6b7280; font-weight:bold;'>Kamera aktif. Silakan arahkan ID Card / QR Code ke kamera...</div>";
    
    // Buat tombol tutup kamera jika belum ada
    let stopBtn = document.getElementById("btn-stop-scan");
    if(!stopBtn) {
        stopBtn = document.createElement("button");
        stopBtn.id = "btn-stop-scan";
        stopBtn.className = "btn-danger";
        stopBtn.style.marginTop = "15px";
        stopBtn.style.width = "100%";
        stopBtn.innerText = "Tutup Kamera Scanner";
        stopBtn.onclick = () => window.stopScanner();
        document.getElementById("scan-result").parentNode.insertBefore(stopBtn, document.getElementById("scan-result"));
    }
    stopBtn.classList.remove("hidden");

    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    html5QrcodeScanner.render(async (decodedText, decodedResult) => {
        const now = Date.now();
        
        // MENCEGAH DOUBLE SCAN: Jeda 3 detik untuk barcode yang sama
        if (isProcessingScan) return;
        if (decodedText === lastScannedText && (now - lastScannedTime < 3000)) return;
        
        isProcessingScan = true;
        lastScannedText = decodedText;
        lastScannedTime = now;

        // Indikator loading warna biru di bawah kamera
        document.getElementById("scan-result").innerHTML = `<div style="background: #eef2ff; padding: 15px; border-radius: 8px; text-align: center; color: #4f46e5; margin-top:20px; font-weight:bold;">⏳ Menyimpan data absen...</div>`;

        await prosesHasilScan(decodedText);
        
        isProcessingScan = false; // Buka gerbang untuk scan orang selanjutnya
    }, (errorMessage) => { /* Abaikan error sensor cahaya kamera */ });
};

// Fungsi mematikan kamera manual
window.stopScanner = () => {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
    }
    document.getElementById("btn-start-scan").classList.remove("hidden");
    const stopBtn = document.getElementById("btn-stop-scan");
    if(stopBtn) stopBtn.classList.add("hidden");
    document.getElementById("scan-result").innerHTML = "";
    document.getElementById("scan-result").classList.add("hidden"); 
};

async function prosesHasilScan(scannedText) {
    let namaGuru, emailGuru, namaZona;
    const resultDiv = document.getElementById("scan-result");

    try {
        if (currentUserData.role === "ADMIN") {
            const selectedZoneId = document.getElementById("pic-zone-select").value;
            const qZone = query(collection(db, "zones"), where("id", "==", selectedZoneId));
            const zoneSnap = await getDocs(qZone);
            
            const qGuru = query(collection(db, "guru"), where("Barcode", "==", scannedText));
            const guruSnap = await getDocs(qGuru);
            
            if(guruSnap.empty) {
                // Tampilan merah jika barcode tidak ada di Excel
                resultDiv.innerHTML = `<div style="background:#fee2e2; padding:15px; border-radius:8px; border-left:4px solid var(--danger); margin-top:20px;"><strong style="color:var(--danger); font-size:1.1rem;">❌ GAGAL: Barcode Tidak Terdaftar!</strong><p style="margin:5px 0 0 0;">Barcode ${scannedText} tidak ada di database Guru.</p></div>`;
                return;
            }
            
            const guruData = guruSnap.docs[0].data();
            namaGuru = guruData.Nama;
            emailGuru = guruData.Email;
            namaZona = zoneSnap.docs[0].data().nama; // Zona tempat admin bertugas
            const zonaGuruAsli = guruData.Zona; // Zona penugasan asli guru dari database

            // FITUR BARU: VALIDASI SALAH ZONA (Admin Scan ID Guru)
            if (zonaGuruAsli !== namaZona) {
                resultDiv.innerHTML = `<div style="background:#fee2e2; padding:15px; border-radius:8px; border-left:4px solid var(--danger); margin-top:20px;">
                    <h3 style="color:var(--danger); margin-bottom:5px;">❌ SALAH ZONA TUGAS!</h3>
                    <p style="margin:0;">Guru <strong>${namaGuru}</strong> ditugaskan di <strong>${zonaGuruAsli}</strong>, bukan di sini (${namaZona}).<br>Silakan arahkan guru tersebut ke zona yang benar.</p>
                </div>`;
                return; // Hentikan proses, jangan simpan absen
            }

        } else {
            const qZone = query(collection(db, "zones"), where("kode", "==", scannedText));
            const zoneSnap = await getDocs(qZone);
            if(zoneSnap.empty) {
                resultDiv.innerHTML = `<div style="background:#fee2e2; padding:15px; border-radius:8px; border-left:4px solid var(--danger); margin-top:20px;"><strong style="color:var(--danger);">❌ GAGAL:</strong> QR Code Zona tidak valid!</div>`;
                return;
            }
            
            namaGuru = currentUserData.nama;
            emailGuru = currentUserData.email;
            namaZona = zoneSnap.docs[0].data().nama; // Zona milik QR yang di-scan

            // FITUR BARU: VALIDASI SALAH ZONA (Guru Scan QR)
            if (currentUserData.zona !== namaZona) {
                resultDiv.innerHTML = `<div style="background:#fee2e2; padding:15px; border-radius:8px; border-left:4px solid var(--danger); margin-top:20px;">
                    <h3 style="color:var(--danger); margin-bottom:5px;">❌ SALAH ZONA TUGAS!</h3>
                    <p style="margin:0;">Anda seharusnya bertugas di zona <strong>${currentUserData.zona}</strong>.<br>Anda tidak diizinkan absen di zona ${namaZona}.</p>
                </div>`;
                return; // Hentikan proses
            }
        }

        const now = new Date();
        const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        const status = currentTimeString <= activeSessionData.batasWaktu ? "Tepat Waktu" : "Terlambat";
        
        const tanggalSQL = now.toISOString().split('T')[0];
        const hariIndo = now.toLocaleDateString('id-ID', { weekday: 'long' });
        const tanggalIndo = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

        const qCek = query(collection(db, "attendance"), where("tanggal", "==", tanggalSQL), where("email", "==", emailGuru));
        const cekSnap = await getDocs(qCek);
        let sudahAbsen = false;
        cekSnap.forEach(doc => {
            let d = doc.data();
            if(d.namaKegiatan === activeSessionData.namaKegiatan && d.tipeSesi === activeSessionData.tipeSesi) sudahAbsen = true;
        });

        if (sudahAbsen) {
            // Tampilan Kuning jika guru tersebut nge-scan dua kali
            resultDiv.innerHTML = `<div style="background:#fef3c7; padding:15px; border-radius:8px; border-left:4px solid #d97706; margin-top:20px;"><h3 style="color:#b45309; margin-bottom:5px;">⚠️ SUDAH ABSEN</h3><p style="margin:0;"><strong>${namaGuru}</strong> sudah tercatat hadir pada sesi ini. Lanjut ke peserta berikutnya.</p></div>`;
            return;
        }

        // Simpan ke Cloud
        await addDoc(collection(db, "attendance"), {
            namaGuru, email: emailGuru, namaZona, waktu: currentTimeString, status, tanggal: tanggalSQL, hariStr: hariIndo, tanggalStr: tanggalIndo, 
            namaKegiatan: activeSessionData.namaKegiatan, 
            tipeSesi: activeSessionData.tipeSesi, 
            adminPenanggungJawab: activeSessionData.adminNama, 
            timestamp: now.getTime()
        });

        // Tampilan Sukses (Kamera tetap nyala di atasnya)
        resultDiv.innerHTML = `<div style="background: ${status === 'Tepat Waktu' ? 'var(--primary-light)' : '#ffe6e6'}; padding: 20px; border-radius: 12px; margin-top: 20px; border-left: 4px solid ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}; box-shadow: 0 4px 6px rgba(0,0,0,0.05);"><h3 style="color: ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}; margin-bottom:10px;">✓ ${namaGuru} Berhasil Absen</h3><p><strong>Waktu:</strong> ${currentTimeString} WIB | <strong>Status:</strong> <span class="badge ${status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${status}</span></p></div>`;
        
    } catch (error) { 
        resultDiv.innerHTML = `<div style="background:#fee2e2; padding:15px; border-radius:8px; border-left:4px solid var(--danger); margin-top:20px;"><strong style="color:var(--danger);">ERROR JARINGAN:</strong> ${error.message}</div>`;
    }
}

// --- 7. DATA GURU: EDIT, HAPUS, & IMPORT ---
window.hapusGuru = async (barcode, nama) => {
    const pass = prompt(`Masukkan password otorisasi untuk MENGHAPUS data ${nama}:`);
    if (pass !== "kmigorda") {
        if (pass !== null) alert("Password salah! Aksi dibatalkan.");
        return;
    }

    if (confirm(`Peringatan: Yakin ingin menghapus guru "${nama}" dari sistem secara permanen?`)) {
        try {
            await deleteDoc(doc(db, "guru", barcode));
            alert(`SUKSES: Data guru ${nama} berhasil dihapus.`);
            renderTabelGuru();
        } catch (error) { alert("Gagal menghapus data: " + error.message); }
    }
};

window.editGuru = async (barcode, namaLama, zonaLama, emailLama, kamarLama) => {
    const pass = prompt(`Masukkan password otorisasi untuk MENGEDIT data ${namaLama}:`);
    if (pass !== "kmigorda") {
        if (pass !== null) alert("Password salah! Aksi dibatalkan.");
        return;
    }

    const namaBaru = prompt("Ubah Nama:", namaLama);
    if (namaBaru === null) return;
    
    const kamarBaru = prompt("Ubah Kamar:", kamarLama);
    if (kamarBaru === null) return;

    const zonaBaru = prompt("Ubah Zona Penugasan:", zonaLama);
    if (zonaBaru === null) return;
    
    const emailBaru = prompt("Ubah Email Login:", emailLama);
    if (emailBaru === null) return;

    try {
        await updateDoc(doc(db, "guru", barcode), { 
            Nama: namaBaru.trim(), 
            Kamar: kamarBaru.trim(),
            Zona: zonaBaru.trim(),
            Email: emailBaru.trim()
        });
        alert(`SUKSES: Data guru berhasil diperbarui.`);
        renderTabelGuru(); 
    } catch (error) { alert("Gagal mengedit data guru: " + error.message); }
};

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

// --- FUNGSI BARU: DOWNLOAD QR CODE GURU ---
window.downloadQRGuru = (barcode, nama) => {
    // 1. Buat elemen penampung sementara (tersembunyi)
    const tempDiv = document.createElement("div");
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);

    // 2. Generate QR Code ke dalam penampung
    new QRCode(tempDiv, {
        text: barcode,
        width: 256,
        height: 256,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // 3. Beri waktu beberapa milidetik agar gambar QR selesai dirender
    setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        if (qrCanvas) {
            // 4. Siapkan Canvas baru untuk menggabungkan QR dan Teks
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = 300;
            finalCanvas.height = 370; // Lebih tinggi untuk tempat nama
            const ctx = finalCanvas.getContext("2d");

            // Beri background putih polos
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

            // Tempelkan gambar QR Code di tengah atas
            ctx.drawImage(qrCanvas, 22, 20, 256, 256);

            // Tambahkan Teks Nama Guru
            ctx.fillStyle = "#1f2937"; // Warna teks gelap
            ctx.font = "bold 18px sans-serif";
            ctx.textAlign = "center";
            
            // Potong nama jika terlalu panjang agar tidak keluar batas gambar
            let displayName = nama.length > 25 ? nama.substring(0, 25) + "..." : nama;
            ctx.fillText(displayName, finalCanvas.width / 2, 315);
            
            // Tambahkan Teks Barcode / ID di bawah nama
            ctx.font = "14px sans-serif";
            ctx.fillStyle = "#6b7280"; // Warna abu-abu
            ctx.fillText("ID: " + barcode, finalCanvas.width / 2, 340);

            // 5. Ubah canvas menjadi file gambar dan otomatis download
            const link = document.createElement("a");
            link.download = `QR_Guru_${nama.replace(/[^a-zA-Z0-9]/g, '_')}.png`; // Bersihkan nama file
            link.href = finalCanvas.toDataURL("image/png");
            link.click();
        }
        // Hapus elemen sementara agar memori bersih
        document.body.removeChild(tempDiv);
    }, 300);
};

// --- UPDATE TABEL GURU (MENAMBAHKAN TOMBOL DOWNLOAD QR) ---
async function renderTabelGuru() {
    const tbody = document.getElementById("body-guru");
    tbody.innerHTML = "<tr><td colspan='10' style='text-align:center;'>Memuat...</td></tr>";
    
    const guruSnap = await getDocs(collection(db, "guru"));
    tbody.innerHTML = "";
    
    if (guruSnap.empty) {
        return tbody.innerHTML = "<tr><td colspan='10' style='text-align:center;'>Belum ada data guru.</td></tr>";
    }
    
    let idx = 1;
    guruSnap.forEach((doc) => {
        let guru = doc.data();
        let barcodeId = doc.id; 
        
        tbody.innerHTML += `<tr>
            <td>${idx++}</td>
            <td>${guru.Barcode}</td>
            <td>${guru.Nama}</td>
            <td>${guru.Tahun}</td>
            <td>${guru.Daerah}</td>
            <td>${guru.Kamar}</td>
            <td>${guru.Study}</td>
            <td>${guru["No HP"]}</td>
            <td>${guru.Zona}</td>
            <td>
                <button onclick="downloadQRGuru('${guru.Barcode}', '${guru.Nama}')" style="background:#10b981; color:#fff; border:none; padding:5px; border-radius:4px; cursor:pointer; font-size:0.7rem; margin-bottom:5px; display:block; width:100%; font-weight:bold;">Unduh QR</button>
                <button onclick="editGuru('${barcodeId}', '${guru.Nama}', '${guru.Zona}', '${guru.Email}', '${guru.Kamar}')" style="background:#f59e0b; color:#fff; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.7rem; margin-bottom:5px; display:block; width:100%;">Edit</button>
                <button onclick="hapusGuru('${barcodeId}', '${guru.Nama}')" style="background:#dc2626; color:#fff; border:none; padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.7rem; display:block; width:100%;">Hapus</button>
            </td>
        </tr>`;
    });
}

// --- UPDATE RENDER ZONA (MENAMBAH TOMBOL DOWNLOAD PER ZONA) ---
async function renderManajemenZona() {
    const grid = document.getElementById("zona-grid");
    const zonesSnap = await getDocs(collection(db, "zones"));
    grid.innerHTML = "";
    
    let zones = [];
    zonesSnap.forEach(doc => zones.push(doc.data()));

    zones.forEach(zona => {
        grid.innerHTML += `
        <div class="zona-card" style="text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 12px; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <h4 style="margin-bottom: 5px; color: #1f2937;">${zona.nama}</h4>
            <p style="font-size: 0.8rem; color: #6b7280; margin-bottom: 15px;">Kode: ${zona.kode}</p>
            <div class="qr-container" id="qr-${zona.id}" style="display: flex; justify-content: center; margin-bottom: 15px; min-height: 128px;"></div>
            <button onclick="downloadQRZona('${zona.kode}', '${zona.nama}')" style="background:#10b981; color:#fff; border:none; padding:10px; border-radius:8px; cursor:pointer; font-size:0.85rem; width:100%; font-weight:bold; transition: 0.2s;">Unduh QR Zona Ini</button>
        </div>`;
    });
    
    setTimeout(() => {
        zones.forEach(zona => new QRCode(document.getElementById(`qr-${zona.id}`), {
            text: zona.kode, 
            width: 128, 
            height: 128, 
            colorDark : "#000000", 
            colorLight : "#ffffff", 
            correctLevel : QRCode.CorrectLevel.H
        }));
    }, 100);
}

// --- FUNGSI BARU: DOWNLOAD SATU QR CODE ZONA (RESOLUSI TINGGI UNTUK POSTER) ---
window.downloadQRZona = (kodeZona, namaZona) => {
    // 1. Buat elemen penampung sementara (tersembunyi)
    const tempDiv = document.createElement("div");
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);

    // 2. Generate QR Code ukuran besar ke dalam penampung
    new QRCode(tempDiv, {
        text: kodeZona,
        width: 300,
        height: 300,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    // 3. Beri waktu agar gambar QR selesai dirender
    setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        if (qrCanvas) {
            // 4. Siapkan Canvas baru untuk menggabungkan QR dan Teks
            const finalCanvas = document.createElement("canvas");
            finalCanvas.width = 350;
            finalCanvas.height = 420; // Lebih tinggi untuk tempat tulisan
            const ctx = finalCanvas.getContext("2d");

            // Beri background putih polos
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

            // Tempelkan gambar QR Code di tengah
            ctx.drawImage(qrCanvas, 25, 20, 300, 300);

            // Tambahkan Teks Nama Zona
            ctx.fillStyle = "#1f2937"; // Warna teks gelap
            ctx.font = "bold 24px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(namaZona, finalCanvas.width / 2, 360);
            
            // Tambahkan Instruksi di bawah nama zona
            ctx.font = "16px sans-serif";
            ctx.fillStyle = "#6b7280"; // Warna abu-abu
            ctx.fillText("Scan QR untuk Absen di Sini", finalCanvas.width / 2, 390);

            // 5. Ubah canvas menjadi file gambar dan otomatis download
            const link = document.createElement("a");
            link.download = `Poster_QR_Zona_${namaZona.replace(/[^a-zA-Z0-9]/g, '_')}.png`; 
            link.href = finalCanvas.toDataURL("image/png");
            link.click();
        }
        // Hapus elemen sementara agar memori bersih
        document.body.removeChild(tempDiv);
    }, 300);
};

// --- FUNGSI BARU: REFRESH SEMUA QR ZONA (ANTI-KECURANGAN) ---
window.refreshSemuaQRZona = async () => {
    if (currentUserData.role !== "ADMIN") return alert("Akses Ditolak!");
    
    if (!confirm("PERINGATAN ANTI-KECURANGAN:\n\nAnda akan mereset dan MENGGANTI SEMUA QR Code Zona. QR Code yang lama (maupun foto yang disimpan guru) akan HANGUS dan otomatis ditolak oleh sistem.\n\nYakin ingin mereset sekarang?")) return;

    const btn = document.getElementById("btn-refresh-qr");
    if(btn) { btn.innerText = "Mereset..."; btn.disabled = true; }

    try {
        const zonesSnap = await getDocs(collection(db, "zones"));
        const batch = writeBatch(db); // Gunakan batch agar update ke database terjadi serentak

        zonesSnap.forEach(docSnap => {
            const data = docSnap.data();
            
            // Generate 6 kode acak baru (Kombinasi huruf kapital & angka)
            const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
            
            // Format kode baru: "QR_G_RIYADH_A8F2K9"
            const newKode = `QR_${data.id}_${randomStr}`; 

            batch.update(doc(db, "zones", docSnap.id), { kode: newKode });
        });

        await batch.commit();
        alert("SUKSES: Semua QR Code Zona telah diperbarui!\n\nGuru yang mencoba scan pakai foto QR lama akan langsung DITOLAK. Silakan unduh/tampilkan QR yang baru.");
        
        renderManajemenZona(); // Muat ulang gambar QR di layar dengan kode yang baru
    } catch (error) {
        alert("Gagal mereset QR: " + error.message);
    } finally {
        if(btn) { btn.innerText = "🔄 Refresh Semua QR"; btn.disabled = false; }
    }
};


// --- 8. FUNGSI LOGIKA REKAP OTOMATIS & KONFIRMASI STATUS UI (MODAL) ---
async function getRekapWithAbsentees() {
    const attSnap = await getDocs(collection(db, "attendance"));
    const guruSnap = await getDocs(collection(db, "guru"));

    let allGuru = [];
    guruSnap.forEach(doc => allGuru.push(doc.data()));

    let dataRekap = [];
    let uniqueSessions = {}; 

    attSnap.forEach(doc => {
        let d = doc.data();
        d.docId = doc.id;           
        d.isVirtual = false;        
        dataRekap.push(d);
        
        let sessionKey = `${d.tanggal}_${d.namaKegiatan}_${d.tipeSesi}`;
        if (!uniqueSessions[sessionKey]) {
            uniqueSessions[sessionKey] = {
                tanggal: d.tanggal, hariStr: d.hariStr, tanggalStr: d.tanggalStr, namaKegiatan: d.namaKegiatan,
                tipeSesi: d.tipeSesi, adminPenanggungJawab: d.adminPenanggungJawab, timestamp: d.timestamp,
                attendedEmails: new Set()
            };
        }
        uniqueSessions[sessionKey].attendedEmails.add(d.email);
    });

    for (let key in uniqueSessions) {
        let session = uniqueSessions[key];
        allGuru.forEach(guru => {
            if (!session.attendedEmails.has(guru.Email)) {
                dataRekap.push({
                    isVirtual: true, email: guru.Email,
                    tanggal: session.tanggal, hariStr: session.hariStr, tanggalStr: session.tanggalStr, waktu: "-",
                    namaKegiatan: session.namaKegiatan, tipeSesi: session.tipeSesi, namaGuru: guru.Nama, namaZona: guru.Zona || "-",
                    status: "Tidak Hadir", adminPenanggungJawab: session.adminPenanggungJawab, timestamp: session.timestamp - 1 
                });
            }
        });
    }

    dataRekap.sort((a, b) => b.timestamp - a.timestamp);
    return dataRekap;
}

async function renderRekap() {
    const tbody = document.getElementById("body-rekap");
    tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Mengkalkulasi kehadiran dan alpa dari server...</td></tr>";
    try {
        allRekapData = await getRekapWithAbsentees();
        filteredRekapData = [...allRekapData]; 
        
        window.applyFilters(); 
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan='9' style='text-align:center; color:red;'>Gagal memuat: ${error.message}</td></tr>`;
    }
}

// ----------------------------------------------------
// SISTEM POP-UP UBAH STATUS (MODAL UI)
// ----------------------------------------------------
window.ubahStatusRekap = (index) => {
    if (currentUserData.role !== "ADMIN") return alert("Akses Ditolak!");
    
    currentEditIndex = index;
    const data = filteredRekapData[index];
    
    // Tampilkan detail guru
    document.getElementById("modal-status-name").innerHTML = `<strong>${data.namaGuru}</strong><br>Sesi: ${data.namaKegiatan} (${data.tipeSesi})`;
    
    // Setel status sebelumnya ke dropdown
    document.getElementById("modal-status-select").value = data.status;
    
    // Setel waktu 
    const timeGroup = document.getElementById("modal-status-time-group");
    if (data.isVirtual || data.status === "Tidak Hadir") {
        const now = new Date();
        document.getElementById("modal-status-time").value = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
        timeGroup.classList.add("hidden"); // Sembunyikan jam jika defaultnya Tidak Hadir
    } else {
        document.getElementById("modal-status-time").value = data.waktu;
        timeGroup.classList.remove("hidden");
    }
    
    document.getElementById("modal-status").classList.remove("hidden");
};

window.onStatusSelectChange = () => {
    const val = document.getElementById("modal-status-select").value;
    if (val === "Tidak Hadir") {
        document.getElementById("modal-status-time-group").classList.add("hidden");
    } else {
        document.getElementById("modal-status-time-group").classList.remove("hidden");
    }
};

window.closeModalStatus = () => {
    document.getElementById("modal-status").classList.add("hidden");
    currentEditIndex = -1;
};

window.simpanStatusBaru = async () => {
    if (currentEditIndex === -1) return;
    
    const data = filteredRekapData[currentEditIndex];
    const statusBaru = document.getElementById("modal-status-select").value;
    const jamBaru = document.getElementById("modal-status-time").value;
    const btnSimpan = document.getElementById("btn-simpan-status");

    // Jika tidak ada perubahan, langsung tutup saja
    if (statusBaru === data.status && jamBaru === data.waktu) {
        window.closeModalStatus();
        return;
    }

    try {
        btnSimpan.innerText = "Menyimpan...";
        btnSimpan.disabled = true;
        
        if (data.isVirtual) {
            // DARI "TIDAK HADIR" (ALPA VIRTUAL) MENJADI STATUS LAIN
            if (statusBaru !== "Tidak Hadir") {
                const now = new Date();
                await addDoc(collection(db, "attendance"), {
                    namaGuru: data.namaGuru, email: data.email, namaZona: data.namaZona, waktu: jamBaru || "-", status: statusBaru, 
                    tanggal: data.tanggal, hariStr: data.hariStr, tanggalStr: data.tanggalStr, namaKegiatan: data.namaKegiatan, 
                    tipeSesi: data.tipeSesi, adminPenanggungJawab: currentUserData.nama + " (Konfirmasi)", timestamp: now.getTime()
                });
                alert(`Sukses! Kehadiran ${data.namaGuru} tercatat sebagai ${statusBaru}.`);
            }
        } else {
            // MENGEDIT DATA YANG SUDAH ADA DI CLOUD
            if (statusBaru === "Tidak Hadir") {
                if(confirm("Yakin ubah ke TIDAK HADIR? Riwayat absen ini akan DIHAPUS dari server.")) {
                    await deleteDoc(doc(db, "attendance", data.docId));
                    alert(`Data dihapus. ${data.namaGuru} kembali berstatus Tidak Hadir.`);
                } else {
                    btnSimpan.innerText = "Simpan"; btnSimpan.disabled = false;
                    return;
                }
            } else {
                await updateDoc(doc(db, "attendance", data.docId), {
                    status: statusBaru,
                    waktu: jamBaru || "-",
                    adminPenanggungJawab: currentUserData.nama + " (Update)"
                });
                alert(`Sukses! Status ${data.namaGuru} diperbarui.`);
            }
        }
        
        window.closeModalStatus();
        renderRekap(); // Refresh tabel
    } catch (error) {
        alert("Gagal memperbarui status: " + error.message);
    } finally {
        btnSimpan.innerText = "Simpan";
        btnSimpan.disabled = false;
    }
};

window.applyFilters = () => {
    const fTanggal = document.getElementById("filter-tanggal").value;
    const fJam = document.getElementById("filter-jam").value.toLowerCase();
    const fKegiatan = document.getElementById("filter-kegiatan").value.toLowerCase();
    const fTahap = document.getElementById("filter-tahap").value.toLowerCase();
    const fNama = document.getElementById("filter-nama").value.toLowerCase();
    const fZona = document.getElementById("filter-zona").value.toLowerCase();
    const fStatus = document.getElementById("filter-status").value.toLowerCase();
    const fAdmin = document.getElementById("filter-admin").value.toLowerCase();

    filteredRekapData = allRekapData.filter(d => {
        const matchTanggal = !fTanggal || d.tanggal === fTanggal; 
        const matchJam = !fJam || (d.waktu && d.waktu.toLowerCase().includes(fJam));
        const matchKegiatan = !fKegiatan || (d.namaKegiatan && d.namaKegiatan.toLowerCase().includes(fKegiatan));
        const matchTahap = !fTahap || (d.tipeSesi && d.tipeSesi.toLowerCase().includes(fTahap));
        const matchNama = !fNama || (d.namaGuru && d.namaGuru.toLowerCase().includes(fNama));
        const matchZona = !fZona || (d.namaZona && d.namaZona.toLowerCase().includes(fZona));
        const matchStatus = !fStatus || (d.status && d.status.toLowerCase().includes(fStatus));
        const matchAdmin = !fAdmin || (d.adminPenanggungJawab && d.adminPenanggungJawab.toLowerCase().includes(fAdmin));

        return matchTanggal && matchJam && matchKegiatan && matchTahap && matchNama && matchZona && matchStatus && matchAdmin;
    });

    drawRekapTable(filteredRekapData);
};

// --- RENDER TABEL REKAP & LOGIKA CHECKBOX HAPUS ---
function drawRekapTable(data) {
    const tbody = document.getElementById("body-rekap");
    tbody.innerHTML = "";
    
    // Reset status "Check All" & sembunyikan tombol Hapus Masal tiap kali tabel dimuat ulang
    const checkAll = document.getElementById("check-all");
    if(checkAll) checkAll.checked = false;
    if(document.getElementById("btn-bulk-delete")) document.getElementById("btn-bulk-delete").classList.add("hidden");

    if (data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='10' style='text-align:center; padding:20px;'>Tidak ada data yang sesuai dengan kriteria filter.</td></tr>";
        return;
    }

    data.forEach((d, index) => {
        let badgeStyle = "";
        if (d.status === 'Tepat Waktu') badgeStyle = "background:#d1fae5; color:#059669;";
        else if (d.status === 'Terlambat') badgeStyle = "background:#ffedd5; color:#ea580c;";
        else if (d.status === 'Izin' || d.status === 'Sakit') badgeStyle = "background:#fef08a; color:#a16207;"; 
        else badgeStyle = "background:#fee2e2; color:#dc2626;"; 

        // Kunci Checkbox & Tombol Hapus jika data adalah Virtual (Sudah Tidak Hadir)
        const isVirtual = d.isVirtual;
        const checkboxHTML = isVirtual ? `<input type="checkbox" disabled style="opacity: 0.3;">` : `<input type="checkbox" class="check-rekap" value="${index}" onchange="updateBulkDeleteButton()" style="transform: scale(1.2); cursor: pointer;">`;
        const btnHapusHTML = isVirtual ? 
            `<button disabled style="background:#fca5a5; color:#fff; border:none; padding:5px 8px; border-radius:6px; font-size:0.75rem; cursor:not-allowed; opacity: 0.7;">Hapus</button>` : 
            `<button onclick="hapusSatuRekap(${index})" style="background:#dc2626; color:#fff; border:none; padding:5px 8px; border-radius:6px; cursor:pointer; font-size:0.75rem;">Hapus</button>`;

        tbody.innerHTML += `<tr>
            <td style="text-align: center;">${checkboxHTML}</td>
            <td><strong>${d.hariStr}</strong>, ${d.tanggalStr}</td>
            <td>${d.waktu}</td>
            <td><strong>${d.namaKegiatan}</strong></td>
            <td><span style="background:#eef2ff; color:#4f46e5; padding:3px 8px; border-radius:4px; font-size:0.85rem;">${d.tipeSesi}</span></td>
            <td><strong>${d.namaGuru}</strong></td>
            <td>${d.namaZona}</td>
            <td><span class="badge" style="${badgeStyle}">${d.status}</span></td>
            <td>${d.adminPenanggungJawab}</td>
            <td>
                <button onclick="ubahStatusRekap(${index})" style="background:#6366f1; color:#fff; border:none; padding:5px 8px; border-radius:6px; cursor:pointer; font-size:0.75rem; margin-right: 2px; margin-bottom: 2px;">Ubah</button>
                ${btnHapusHTML}
            </td>
        </tr>`;
    });
}

// Fitur Centang Semua Checkbox
window.toggleCheckAll = () => {
    const checkAll = document.getElementById("check-all");
    const checkboxes = document.querySelectorAll('.check-rekap:not([disabled])');
    checkboxes.forEach(cb => cb.checked = checkAll.checked);
    updateBulkDeleteButton();
};

// Fitur Update Angka di Tombol Hapus Masal
window.updateBulkDeleteButton = () => {
    const checkedCount = document.querySelectorAll('.check-rekap:checked').length;
    const btn = document.getElementById("btn-bulk-delete");
    if (checkedCount > 0) {
        btn.classList.remove("hidden");
        btn.innerText = `Hapus Terpilih (${checkedCount})`;
    } else {
        btn.classList.add("hidden");
    }
};

// LOGIKA 1: Hapus Satu Data Rekap
window.hapusSatuRekap = async (index) => {
    if (currentUserData.role !== "ADMIN") return alert("Akses Ditolak!");
    const data = filteredRekapData[index];
    
    if (confirm(`Yakin ingin MENGHAPUS riwayat kehadiran untuk ${data.namaGuru}?\n(Status absensinya pada kegiatan ini akan kembali menjadi "Tidak Hadir")`)) {
        try {
            await deleteDoc(doc(db, "attendance", data.docId));
            alert("Satu data kehadiran berhasil dihapus.");
            renderRekap();
        } catch (error) {
            alert("Gagal menghapus: " + error.message);
        }
    }
};

// LOGIKA 2: Hapus Banyak Data Rekap Sekaligus (Batch Delete)
window.hapusBanyakRekap = async () => {
    if (currentUserData.role !== "ADMIN") return alert("Akses Ditolak!");
    
    const checkboxes = document.querySelectorAll('.check-rekap:checked');
    if (checkboxes.length === 0) return;

    if (confirm(`PERINGATAN TINGKAT TINGGI:\nAnda akan menghapus ${checkboxes.length} data kehadiran secara permanen!\n\nSemua guru yang Anda centang akan kembali berstatus "Tidak Hadir". Apakah Anda yakin?`)) {
        const btn = document.getElementById("btn-bulk-delete");
        btn.innerText = "Menghapus...";
        btn.disabled = true;
        
        try {
            const batch = writeBatch(db); // Menggunakan fitur Batch dari Firebase agar super cepat
            let count = 0;
            
            checkboxes.forEach(cb => {
                const index = parseInt(cb.value);
                const data = filteredRekapData[index];
                if (!data.isVirtual && data.docId) {
                    batch.delete(doc(db, "attendance", data.docId));
                    count++;
                }
            });
            
            if (count > 0) {
                await batch.commit();
                alert(`${count} data kehadiran berhasil dihapus secara masal!`);
                renderRekap();
            }
        } catch (error) {
            alert("Gagal menghapus data masal: " + error.message);
        } finally {
            btn.disabled = false;
        }
    }
};

window.resetFilters = () => {
    document.getElementById("filter-tanggal").value = "";
    document.getElementById("filter-jam").value = "";
    document.getElementById("filter-kegiatan").value = "";
    document.getElementById("filter-tahap").value = "";
    document.getElementById("filter-nama").value = "";
    document.getElementById("filter-zona").value = "";
    document.getElementById("filter-status").value = "";
    document.getElementById("filter-admin").value = "";
    
    window.applyFilters(); 
};

window.exportRekapToExcel = async () => {
    try {
        if (filteredRekapData.length === 0) return alert("Peringatan: Tidak ada data hasil filter yang bisa di-export!");
        
        const btn = document.querySelector("#page-rekap .btn-secondary");
        btn.innerText = "Mengekspor...";

        let dataExport = filteredRekapData.map((d, index) => ({
            "No": index + 1, 
            "Hari": d.hariStr, 
            "Tanggal": d.tanggalStr, 
            "Jam Absen": d.waktu, 
            "Nama Kegiatan": d.namaKegiatan, 
            "Tahap Absensi": d.tipeSesi, 
            "Nama Guru": d.namaGuru, 
            "Zona": d.namaZona, 
            "Status": d.status, 
            "Admin Bertugas": d.adminPenanggungJawab
        }));

        const ws = XLSX.utils.json_to_sheet(dataExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Rekap Absensi");
        XLSX.writeFile(wb, "Rekap_EduAbsen_Filtered.xlsx");
        
        btn.innerText = "Export ke Excel (Sesuai Filter)";
    } catch (error) { 
        alert("Gagal export: " + error.message); 
        document.querySelector("#page-rekap .btn-secondary").innerText = "Export ke Excel (Sesuai Filter)";
    }
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
