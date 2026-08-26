// ==========================================
// SISTEM ABSENSI HYBRID (ZONA & KARTU GURU)
// ==========================================

let currentUserData = null;
let html5QrcodeScanner = null;

const DEFAULT_ZONES = [
    { id: "G_RIYADH", nama: "Gedung Riyadh", kode: "QR_G_RIYADH" },
    { id: "G_MADINAH", nama: "Gedung Madinah", kode: "QR_G_MADINAH" },
    { id: "MASJID", nama: "Masjid", kode: "QR_MASJID" },
    { id: "AUDITORIUM", nama: "Auditorium", kode: "QR_AUDITORIUM" }
];

function initSystem() {
    if (!localStorage.getItem("db_zones")) localStorage.setItem("db_zones", JSON.stringify(DEFAULT_ZONES));
    if (!localStorage.getItem("db_guru")) localStorage.setItem("db_guru", JSON.stringify([]));
}

// --- 1. LOGIN & PROTEKSI BUG FLASHING ---
function checkLoginStatus() {
    const loggedInUser = localStorage.getItem("mockUser");
    if (loggedInUser) {
        currentUserData = JSON.parse(loggedInUser);
        
        document.getElementById("login-section").classList.add("hidden");
        document.getElementById("app-section").classList.remove("hidden");
        document.getElementById("user-name-display").innerText = currentUserData.nama;
        document.getElementById("welcome-name").innerText = currentUserData.nama;

        if (currentUserData.role === "ADMIN") {
            document.querySelectorAll(".admin-only").forEach(el => {
                el.classList.remove("hidden");
                el.style.display = ""; // Kembalikan ke normal
            });
            initAdminDashboard();
            renderTabelGuru();
            renderManajemenZona();
        } else {
            // Fix Bug: Sembunyikan secara paksa agar tidak berkedip
            document.querySelectorAll(".admin-only").forEach(el => {
                el.classList.add("hidden");
                el.style.display = "none"; 
            });
            initGuruDashboard();
        }
        
        navigate('dashboard'); // Selalu kembali ke dashboard saat awal masuk
    } else {
        document.getElementById("login-section").classList.remove("hidden");
        document.getElementById("app-section").classList.add("hidden");
    }
}

document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    if (email === "zhelaal.one@gmail.com" && password === "2026") {
        const userData = { uid: "ADM-001", nama: "Zhela (Admin)", email: email, role: "ADMIN" };
        localStorage.setItem("mockUser", JSON.stringify(userData));
        checkLoginStatus();
        return;
    }

    const guruList = JSON.parse(localStorage.getItem("db_guru") || "[]");
    const foundGuru = guruList.find(g => g.Email === email);

    if (foundGuru) {
        if (password === "123456") {
            const userData = { uid: foundGuru.Barcode, nama: foundGuru.Nama, email: foundGuru.Email, zona: foundGuru.Zona, role: "GURU" };
            localStorage.setItem("mockUser", JSON.stringify(userData));
            checkLoginStatus();
        } else {
            document.getElementById("login-error").innerText = "Password salah! (Gunakan: 123456)";
        }
    } else {
        document.getElementById("login-error").innerText = "Email belum terdaftar.";
    }
});

window.logout = () => { localStorage.removeItem("mockUser"); location.reload(); };

// --- 2. NAVIGASI MENU ---
window.navigate = (pageId) => {
    // Keamanan Ekstra: Cegah Guru membuka halaman admin
    if (currentUserData.role !== "ADMIN" && (pageId === "guru" || pageId === "zona" || pageId === "rekap")) {
        return;
    }

    document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
    const targetPage = document.getElementById(`page-${pageId}`);
    if(targetPage) targetPage.classList.remove("hidden");
    
    if (pageId !== "scan" && html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
        document.getElementById("btn-start-scan").classList.remove("hidden");
    }

    // Ubah tampilan scanner sesuai peran (Hybrid)
    if (pageId === "scan") setupScannerUI();
};

function setupScannerUI() {
    if (!currentUserData) return;
    const adminSelector = document.getElementById("admin-zone-selector");
    const scanTitle = document.getElementById("scan-title");
    const scanDesc = document.getElementById("scan-desc");
    
    if (currentUserData.role === "ADMIN") {
        adminSelector.classList.remove("hidden");
        scanTitle.innerText = "Scan Kartu Guru (Sistem 1)";
        scanDesc.innerText = "Pilih zona tugas Anda, lalu scan Barcode/ID Card milik guru.";
        
        const select = document.getElementById("pic-zone-select");
        const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
        select.innerHTML = '<option value="">-- Pilih Zona Anda Bertugas --</option>';
        zones.forEach(z => {
            select.innerHTML += `<option value="${z.id}">${z.nama}</option>`;
        });
    } else {
        adminSelector.classList.add("hidden");
        scanTitle.innerText = "Scan QR Zona (Sistem 2)";
        scanDesc.innerText = "Arahkan kamera ke QR Code yang terdapat di zona absensi Anda.";
    }
}

// --- 3. DASHBOARD ---
function initAdminDashboard() {
    let attendanceList = JSON.parse(localStorage.getItem("db_attendance") || "[]");
    let guruList = JSON.parse(localStorage.getItem("db_guru") || "[]");
    const today = new Date().toISOString().split('T')[0];
    
    let todaysData = attendanceList.filter(d => d.tanggal === today);
    let totalHadir = todaysData.length;
    let totalGuru = guruList.length > 0 ? guruList.length : 1; 
    let belumHadir = totalGuru - totalHadir;
    
    let tepatWaktu = todaysData.filter(d => d.status === "Tepat Waktu").length;
    let terlambat = todaysData.filter(d => d.status === "Terlambat").length;

    const tbody = document.getElementById("recent-attendance-body");
    if(tbody) tbody.innerHTML = "";

    todaysData.slice().reverse().forEach(data => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td>`;
        if(tbody) tbody.appendChild(tr);
    });

    if(document.getElementById("stat-total")) document.getElementById("stat-total").innerText = totalGuru;
    if(document.getElementById("stat-hadir")) document.getElementById("stat-hadir").innerText = totalHadir;
    if(document.getElementById("stat-belum")) document.getElementById("stat-belum").innerText = belumHadir < 0 ? 0 : belumHadir;
    if(document.getElementById("stat-tepat")) document.getElementById("stat-tepat").innerText = tepatWaktu;
    if(document.getElementById("stat-terlambat")) document.getElementById("stat-terlambat").innerText = terlambat;
}

function initGuruDashboard() {
    let attendanceList = JSON.parse(localStorage.getItem("db_attendance") || "[]");
    const today = new Date().toISOString().split('T')[0];
    let myAttendance = attendanceList.filter(d => d.email === currentUserData.email);
    
    const tbody = document.getElementById("recent-attendance-body");
    if(tbody) tbody.innerHTML = "";

    if (myAttendance.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Anda belum absen hari ini.</td></tr>";
        return;
    }

    myAttendance.slice().reverse().forEach(data => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td>`;
        if(tbody) tbody.appendChild(tr);
    });
}

// --- 4. DATA GURU (IMPORT) ---
window.downloadTemplate = () => {
    const templateData = [{"No": 1, "Barcode": "187643", "Nama": "Raihan", "Tahun": "Thn 6", "Daerah": "Bima", "Kamar": "Panjimas", "Study": "Ilmu Qur'an Tafsir", "No HP": "08123456789", "Zona": "Gedung Riyadh", "Email": "raihan@eduabsen.com"}];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Guru");
    XLSX.writeFile(wb, "Template_Import_Guru.xlsx");
};

window.handleExcelImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        let validData = [];
        let errorCount = 0;

        jsonData.forEach(row => {
            if(row.Barcode && row.Nama && row.Zona && row.Email) {
                row["No HP"] = row["No HP"] ? row["No HP"].toString() : "-";
                validData.push(row);
            } else {
                errorCount++;
            }
        });

        if (validData.length > 0) {
            localStorage.setItem("db_guru", JSON.stringify(validData));
            alert(`Berhasil mengimpor ${validData.length} data guru.${errorCount > 0 ? ' (' + errorCount + ' data gagal)' : ''}`);
            renderTabelGuru();
            initAdminDashboard();
        } else {
            alert("Gagal mengimpor data. Kolom Barcode, Nama, Zona, & Email wajib diisi.");
        }
        event.target.value = ""; 
    };
    reader.readAsArrayBuffer(file);
};

function renderTabelGuru() {
    const tbody = document.getElementById("body-guru");
    const guruData = JSON.parse(localStorage.getItem("db_guru") || "[]");
    tbody.innerHTML = "";
    if (guruData.length === 0) return tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Belum ada data guru.</td></tr>";
    
    guruData.forEach((guru, idx) => {
        tbody.innerHTML += `<tr><td>${idx + 1}</td><td>${guru.Barcode}</td><td>${guru.Nama}</td><td>${guru.Tahun}</td><td>${guru.Daerah}</td><td>${guru.Kamar}</td><td>${guru.Study}</td><td>${guru["No HP"]}</td><td>${guru.Zona}</td></tr>`;
    });
}

function renderManajemenZona() {
    const grid = document.getElementById("zona-grid");
    const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
    grid.innerHTML = "";
    zones.forEach(zona => {
        grid.innerHTML += `<div class="zona-card"><h4>${zona.nama}</h4><p>Kode: ${zona.kode}</p><div class="qr-container" id="qr-${zona.id}"></div></div>`;
    });
    setTimeout(() => {
        zones.forEach(zona => new QRCode(document.getElementById(`qr-${zona.id}`), {text: zona.kode, width: 128, height: 128, colorDark : "#000", colorLight : "#fff", correctLevel : QRCode.CorrectLevel.H}));
    }, 100);
}

// --- 5. LOGIKA HYBRID SCANNER ---
window.startScanner = async () => {
    document.getElementById("btn-start-scan").classList.add("hidden");
    document.getElementById("scan-result").classList.add("hidden"); 
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    
    html5QrcodeScanner.render(async (decodedText, decodedResult) => {
        html5QrcodeScanner.clear(); // Hentikan kamera setelah dapat 1 hasil
        document.getElementById("btn-start-scan").classList.remove("hidden");
        await prosesHasilScan(decodedText);
    }, (errorMessage) => {});
};

async function prosesHasilScan(scannedText) {
    let namaGuru, emailGuru, namaZona;

    if (currentUserData.role === "ADMIN") {
        // SISTEM 1: Admin Scan Kartu Guru
        const selectedZoneId = document.getElementById("pic-zone-select").value;
        if (!selectedZoneId) {
            alert("GAGAL: Pilih 'Zona Tugas Anda' di kotak dropdown terlebih dahulu!");
            return;
        }
        
        const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
        const foundZone = zones.find(z => z.id === selectedZoneId);
        
        const guruList = JSON.parse(localStorage.getItem("db_guru") || "[]");
        const foundGuru = guruList.find(g => g.Barcode.toString() === scannedText);
        
        if (!foundGuru) {
            alert(`GAGAL: Guru dengan Barcode "${scannedText}" tidak terdaftar!`);
            return;
        }
        
        namaGuru = foundGuru.Nama;
        emailGuru = foundGuru.Email;
        namaZona = foundZone.nama;
        
    } else {
        // SISTEM 2: Guru Scan QR Zona
        const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
        const foundZone = zones.find(z => z.kode === scannedText);

        if (!foundZone) {
            alert("GAGAL: QR Code Zona tidak valid!");
            return;
        }
        
        namaGuru = currentUserData.nama;
        emailGuru = currentUserData.email;
        namaZona = foundZone.nama;
    }

    // Simpan Data Kehadiran
    const batasWaktu = "20:30";
    const now = new Date();
    const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const status = currentTimeString <= batasWaktu ? "Tepat Waktu" : "Terlambat";
    const today = now.toISOString().split('T')[0];

    let attendanceList = JSON.parse(localStorage.getItem("db_attendance") || "[]");
    const sudahAbsen = attendanceList.find(d => d.tanggal === today && d.email === emailGuru);
    
    if (sudahAbsen) {
        alert(`INFO: ${namaGuru} sudah melakukan absensi hari ini!`);
        return;
    }

    attendanceList.push({ namaGuru, email: emailGuru, namaZona, tanggal: today, waktu: currentTimeString, status });
    localStorage.setItem("db_attendance", JSON.stringify(attendanceList));

    // Tampilkan Papan Notifikasi
    const resultDiv = document.getElementById("scan-result");
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = `<div style="background: ${status === 'Tepat Waktu' ? 'var(--primary-light)' : '#ffe6e6'}; padding: 20px; border-radius: 12px; margin-top: 20px; border-left: 4px solid ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'};"><h3 style="color: ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}">✓ Absensi Berhasil</h3><p><strong>Nama:</strong> ${namaGuru}</p><p><strong>Zona:</strong> ${namaZona}</p><p><strong>Waktu:</strong> ${currentTimeString} WIB</p><p><strong>Status:</strong> <span class="badge ${status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${status}</span></p></div>`;

    if (currentUserData.role === "ADMIN") initAdminDashboard();
    else initGuruDashboard();
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
