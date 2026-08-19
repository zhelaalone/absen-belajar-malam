// ==========================================
// SISTEM ABSENSI GURU - VERSI ADVANCED (LOKAL)
// ==========================================

let currentUserData = null;
let html5QrcodeScanner = null;

// Database Default
const DEFAULT_ZONES = [
    { id: "G_RIYADH", nama: "Gedung Riyadh", kode: "QR_G_RIYADH" },
    { id: "G_MADINAH", nama: "Gedung Madinah", kode: "QR_G_MADINAH" },
    { id: "MASJID", nama: "Masjid", kode: "QR_MASJID" },
    { id: "AUDITORIUM", nama: "Auditorium", kode: "QR_AUDITORIUM" }
];

// --- INIT SISTEM ---
function initSystem() {
    if (!localStorage.getItem("db_zones")) localStorage.setItem("db_zones", JSON.stringify(DEFAULT_ZONES));
    if (!localStorage.getItem("db_guru")) localStorage.setItem("db_guru", JSON.stringify([]));
}

// --- 1. LOGIN ---
function checkLoginStatus() {
    const loggedInUser = localStorage.getItem("mockUser");
    if (loggedInUser) {
        currentUserData = JSON.parse(loggedInUser);
        
        document.getElementById("login-section").classList.add("hidden");
        document.getElementById("app-section").classList.remove("hidden");
        
        document.getElementById("user-name-display").innerText = currentUserData.nama;
        document.getElementById("welcome-name").innerText = currentUserData.nama;

        // Cek Role: ADMIN atau GURU
        if (currentUserData.role === "ADMIN") {
            document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
            initAdminDashboard();
            renderTabelGuru();
            renderManajemenZona();
        } else {
            // Jika GURU, sembunyikan menu admin dan load dashboard versi guru
            document.querySelectorAll(".admin-only").forEach(el => el.classList.add("hidden"));
            initGuruDashboard();
        }
    } else {
        document.getElementById("login-section").classList.remove("hidden");
        document.getElementById("app-section").classList.add("hidden");
    }
}

document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    // 1. Cek Akses Admin Utama
    if (email === "zhelaal.one@gmail.com" && password === "2026") {
        const userData = { uid: "ADM-001", nama: "Zhela (Admin)", email: email, role: "ADMIN" };
        localStorage.setItem("mockUser", JSON.stringify(userData));
        checkLoginStatus();
        return;
    }

    // 2. Cek Akses Guru (Berdasarkan data Excel yang di-import)
    const guruList = JSON.parse(localStorage.getItem("db_guru") || "[]");
    const foundGuru = guruList.find(g => g.Email === email);

    if (foundGuru) {
        // Password default untuk semua akun guru adalah 123456
        if (password === "123456") {
            const userData = { 
                uid: foundGuru.Barcode, 
                nama: foundGuru.Nama, 
                email: foundGuru.Email, 
                zona: foundGuru.Zona, 
                role: "GURU" 
            };
            localStorage.setItem("mockUser", JSON.stringify(userData));
            checkLoginStatus();
        } else {
            document.getElementById("login-error").innerText = "Password salah! (Gunakan password default: 123456)";
        }
    } else {
        document.getElementById("login-error").innerText = "Email belum terdaftar. Silakan hubungi Administrator.";
    }
});

window.logout = () => { localStorage.removeItem("mockUser"); location.reload(); };

// --- 2. NAVIGASI MENU ---
window.navigate = (pageId) => {
    document.querySelectorAll(".page").forEach(page => page.classList.add("hidden"));
    document.getElementById(`page-${pageId}`).classList.remove("hidden");
    
    if (pageId !== "scan" && html5QrcodeScanner) {
        html5QrcodeScanner.clear();
        html5QrcodeScanner = null;
        document.getElementById("btn-start-scan").classList.remove("hidden");
    }
};

// --- 3. DASHBOARD (ADMIN & GURU) ---
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
    
    // Guru HANYA melihat absensinya sendiri (Sesuai SOP)
    let myAttendance = attendanceList.filter(d => d.email === currentUserData.email);
    
    const tbody = document.getElementById("recent-attendance-body");
    if(tbody) tbody.innerHTML = "";

    if (myAttendance.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Anda belum melakukan absensi hari ini. Silakan masuk ke menu Scan Barcode.</td></tr>";
        return;
    }

    myAttendance.slice().reverse().forEach(data => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${data.namaGuru}</td><td>${data.namaZona}</td><td>${data.waktu}</td><td><span class="badge ${data.status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${data.status}</span></td>`;
        if(tbody) tbody.appendChild(tr);
    });
}

// --- 4. IMPORT EXCEL & DATA GURU ---
window.downloadTemplate = () => {
    const templateData = [
        {"No": 1, "Barcode": "187643", "Nama": "Raihan", "Tahun": "Thn 6", "Daerah": "Bima", "Kamar": "Panjimas", "Study": "Ilmu Qur'an Tafsir", "No HP": "08123456789", "Zona": "Gedung Riyadh", "Email": "raihan@eduabsen.com"}
    ];
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
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        let validData = [];
        let errorCount = 0;

        jsonData.forEach((row, index) => {
            // Memastikan Barcode, Nama, Zona, DAN Email tersedia
            if(row.Barcode && row.Nama && row.Zona && row.Email) {
                row["No HP"] = row["No HP"] ? row["No HP"].toString() : "-";
                validData.push(row);
            } else {
                errorCount++;
            }
        });

        if (validData.length > 0) {
            localStorage.setItem("db_guru", JSON.stringify(validData));
            alert(`Berhasil mengimpor ${validData.length} data guru.${errorCount > 0 ? ' (' + errorCount + ' data gagal karena tidak lengkap)' : ''}`);
            renderTabelGuru();
            initAdminDashboard();
        } else {
            alert("Gagal mengimpor data. Pastikan kolom Barcode, Nama, Zona, dan Email tidak kosong.");
        }
        event.target.value = ""; 
    };
    reader.readAsArrayBuffer(file);
};

function renderTabelGuru() {
    const tbody = document.getElementById("body-guru");
    const guruData = JSON.parse(localStorage.getItem("db_guru") || "[]");
    tbody.innerHTML = "";
    
    if (guruData.length === 0) {
        tbody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Belum ada data guru. Silakan import excel.</td></tr>";
        return;
    }

    guruData.forEach((guru, idx) => {
        tbody.innerHTML += `
            <tr>
                <td>${idx + 1}</td>
                <td>${guru.Barcode}</td>
                <td>${guru.Nama}</td>
                <td>${guru.Tahun}</td>
                <td>${guru.Daerah}</td>
                <td>${guru.Kamar}</td>
                <td>${guru.Study}</td>
                <td>${guru["No HP"]}</td>
                <td>${guru.Zona}</td>
            </tr>
        `;
    });
}

// --- 5. MANAJEMEN ZONA & QR GENERATOR ---
function renderManajemenZona() {
    const grid = document.getElementById("zona-grid");
    const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
    grid.innerHTML = "";

    zones.forEach(zona => {
        const cardId = `qr-${zona.id}`;
        grid.innerHTML += `<div class="zona-card"><h4>${zona.nama}</h4><p>Kode: ${zona.kode}</p><div class="qr-container" id="${cardId}"></div></div>`;
    });

    setTimeout(() => {
        zones.forEach(zona => {
            new QRCode(document.getElementById(`qr-${zona.id}`), {
                text: zona.kode, width: 128, height: 128, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H
            });
        });
    }, 100);
}

// --- 6. SCANNER ---
window.startScanner = async () => {
    document.getElementById("btn-start-scan").classList.add("hidden");
    const resultDiv = document.getElementById("scan-result");
    resultDiv.classList.add("hidden"); 
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    
    html5QrcodeScanner.render(async (decodedText, decodedResult) => {
        html5QrcodeScanner.clear();
        document.getElementById("btn-start-scan").classList.remove("hidden");
        await processAttendance(decodedText);
    }, (errorMessage) => {});
};

async function processAttendance(kodeQR) {
    const zones = JSON.parse(localStorage.getItem("db_zones") || "[]");
    const foundZone = zones.find(z => z.kode === kodeQR);

    if (!foundZone) {
        alert("QR Code tidak valid atau zona tidak terdaftar di sistem.");
        return;
    }

    const batasWaktu = "20:30";
    const now = new Date();
    const currentTimeString = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    const status = currentTimeString <= batasWaktu ? "Tepat Waktu" : "Terlambat";
    const today = now.toISOString().split('T')[0];

    let attendanceList = JSON.parse(localStorage.getItem("db_attendance") || "[]");
    const sudahAbsen = attendanceList.find(d => d.tanggal === today && d.email === currentUserData.email);
    
    if (sudahAbsen) {
        alert("Anda sudah melakukan absensi hari ini!");
        return;
    }

    const attendanceRecord = {
        namaGuru: currentUserData.nama,
        email: currentUserData.email,
        namaZona: foundZone.nama,
        tanggal: today,
        waktu: currentTimeString,
        status: status
    };

    attendanceList.push(attendanceRecord);
    localStorage.setItem("db_attendance", JSON.stringify(attendanceList));

    const resultDiv = document.getElementById("scan-result");
    resultDiv.classList.remove("hidden");
    resultDiv.innerHTML = `<div style="background: ${status === 'Tepat Waktu' ? 'var(--primary-light)' : '#ffe6e6'}; padding: 20px; border-radius: 12px; margin-top: 20px; border-left: 4px solid ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'};"><h3 style="color: ${status === 'Tepat Waktu' ? 'var(--success)' : 'var(--danger)'}">✓ Absensi Berhasil</h3><p><strong>Nama:</strong> ${currentUserData.nama}</p><p><strong>Zona:</strong> ${foundZone.nama}</p><p><strong>Waktu:</strong> ${currentTimeString} WIB</p><p><strong>Status:</strong> <span class="badge ${status === 'Tepat Waktu' ? 'badge-tepat' : 'badge-terlambat'}">${status}</span></p></div>`;

    if (currentUserData.role === "ADMIN") {
        initAdminDashboard();
    } else {
        initGuruDashboard();
    }
}

// Jam Real-time
setInterval(() => {
    const now = new Date();
    const timeEl = document.getElementById("current-time");
    const dateEl = document.getElementById("current-date");
    if (timeEl) timeEl.innerText = now.toLocaleTimeString('id-ID') + " WIB";
    if (dateEl) dateEl.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}, 1000);

initSystem();
checkLoginStatus();
