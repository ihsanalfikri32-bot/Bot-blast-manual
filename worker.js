import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref as dbRef, onValue, runTransaction, update, set, push } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

const firebaseConfig = {
    databaseURL: "https://web-blast-manual-default-rtdb.firebaseio.com/", 
};

const TELEGRAM_BOT_TOKEN = "8482051630:AAEMjyVO4ufG181ztPo6ErROiYfylYu7oEA"; 
// Username Telegram Admin Anda (atau ID Admin) untuk tujuan pengarahan chat
const ADMIN_TELEGRAM_USERNAME = "Licianpoo"; // Ganti dengan username Telegram Anda (tanpa @) atau biarkan jika ini benar

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const setsRef = dbRef(db, 'sets');
const configRef = dbRef(db, 'config');
const withdrawRef = dbRef(db, 'withdrawals');

const tg = window.Telegram.WebApp;
tg.expand();
const tgUser = tg.initDataUnsafe?.user; 

let workerName = "";
let paymentData = "";
let isWorking = false;
let timerInterval;
let activeSetKey = null; 
let activeSetName = null; 
let activeNumbersString = ""; // Menyimpan teks nomor untuk disalin otomatis
let currentPricePerChat = 0;
let currentSaldo = 0; 

window.onload = () => {
    if (tgUser) {
        workerName = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
        document.getElementById('tg-name-display').innerText = workerName;
    } else {
        document.getElementById('fallback-name-container').classList.remove('hidden');
        document.getElementById('tg-name-display').innerText = "Tamu";
        workerName = localStorage.getItem('wa_worker_name') || "";
        document.getElementById('input-nama').value = workerName;
    }
    paymentData = localStorage.getItem('wa_payment_info') || "";
    document.getElementById('input-payment').value = paymentData;

    if (workerName && paymentData) masukKeWorkspace();
};

window.simpanDataPekerja = () => {
    if (!tgUser) {
        workerName = document.getElementById('input-nama').value.trim();
        if (!workerName) return alert("Nama tidak boleh kosong.");
        localStorage.setItem('wa_worker_name', workerName);
    }
    paymentData = document.getElementById('input-payment').value.trim();
    if (!paymentData) return alert("Metode pencairan wajib diisi.");
    localStorage.setItem('wa_payment_info', paymentData);

    const safeKey = workerName.replace(/[.#$[\]]/g, ''); 
    set(dbRef(db, `workers/${safeKey}`), {
        nama_telegram: workerName,
        data_pembayaran: paymentData,
        login_terakhir: Date.now()
    });
    masukKeWorkspace();
};

window.editPembayaran = () => {
    localStorage.removeItem('wa_payment_info');
    location.reload(); 
};

function masukKeWorkspace() {
    document.getElementById('display-nama').innerText = workerName;
    document.getElementById('panel-login').classList.add('hidden');
    document.getElementById('panel-workspace').classList.remove('hidden');
    mulaiPantauSistem();
}

function mulaiPantauSistem() {
    onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            const conf = snapshot.val();
            currentPricePerChat = conf.price_per_chat || 0;
            document.getElementById('info-tarif').innerText = `Rp ${currentPricePerChat.toLocaleString('id-ID')}`;
            hitungSaldo(); 
        }
    });

    onValue(setsRef, (snapshot) => {
        if (isWorking) return; 
        
        const gridSets = document.getElementById('grid-sets');
        const historyTbody = document.getElementById('worker-history-list');
        gridSets.innerHTML = ''; 
        historyTbody.innerHTML = '';
        
        let visibleCount = 0;
        let validNumberCount = 0; 

        if (snapshot.exists()) {
            const setsData = snapshot.val();
            const allSets = Object.keys(setsData).map(key => ({ key, ...setsData[key] }));

            const visibleSets = allSets.filter(set => set.status === "Tersedia" || set.status === "Dikerjakan").sort((a, b) => a.id - b.id);
            visibleCount = visibleSets.length;
            document.getElementById('info-tersedia').innerText = allSets.filter(set => set.status === "Tersedia").length;

            visibleSets.forEach(setInfo => {
                const btn = document.createElement('button');
                if (setInfo.status === "Tersedia") {
                    btn.className = "glass-btn bg-white/5 py-4 px-3 rounded-2xl flex flex-col items-start gap-1 group text-left";
                    btn.innerHTML = `<span class="text-[10px] opacity-50 uppercase tracking-wider">Target Ops</span><span class="text-sm font-medium text-white">${setInfo.name}</span><span class="text-[10px] bg-white/10 px-2 py-0.5 rounded text-white/70 mt-1">${setInfo.count} Target</span>`;
                    btn.onclick = () => takeSet(setInfo.key, setInfo.name);
                } else {
                    btn.className = "glass-btn bg-black/40 py-4 px-3 rounded-2xl flex flex-col items-start gap-1 text-left opacity-60 cursor-not-allowed";
                    btn.disabled = true;
                    btn.innerHTML = `<span class="text-[10px] text-rose-400 uppercase tracking-wider font-bold">🔒 Dieksekusi</span><span class="text-sm font-medium text-white/50 line-through">${setInfo.name}</span>`;
                }
                gridSets.appendChild(btn);
            });

            const myHistorySets = allSets.filter(set => set.worker === workerName && set.status !== "Tersedia").sort((a, b) => b.id - a.id); 
            
            myHistorySets.forEach(setInfo => {
                let badge = '';
                if (setInfo.status === "Menunggu Validasi") badge = '<span class="text-yellow-400/90 text-[10px]">⏳ Otorisasi</span>';
                else if (setInfo.status === "Valid") {
                    badge = '<span class="text-emerald-400 text-[10px]">✔️ Selesai</span>';
                    validNumberCount += (setInfo.count || 0); 
                }
                else if (setInfo.status === "Gagal") badge = '<span class="text-rose-400 text-[10px]">❌ Gagal</span>';
                else if (setInfo.status === "Dikerjakan") badge = '<span class="text-blue-400 text-[10px]">🔄 Proses</span>';

                const tr = document.createElement('tr');
                tr.className = "border-b border-white/5";
                tr.innerHTML = `<td class="py-2 px-1 text-white/80">${setInfo.name}</td><td class="py-2 px-1 text-right">${badge}</td>`;
                historyTbody.appendChild(tr);
            });

            currentSaldo = validNumberCount * currentPricePerChat;
            hitungSaldo();
        }

        if (visibleCount > 0) { document.getElementById('empty-state').classList.add('hidden'); } 
        else { document.getElementById('empty-state').classList.remove('hidden'); }
    });
}

function hitungSaldo() { document.getElementById('display-saldo').innerText = `Rp ${currentSaldo.toLocaleString('id-ID')}`; }

window.ajukanPencairan = async () => {
    if (currentSaldo <= 0) return alert("Selesaikan Gugus Tugas dan tunggu divalidasi Admin untuk mencairkan saldo.");
    if (confirm(`Cairkan Rp ${currentSaldo.toLocaleString('id-ID')} ke:\n${paymentData}?`)) {
        await set(push(withdrawRef), { worker: workerName, payment_info: paymentData, amount: currentSaldo, timestamp: Date.now(), status: "Pending" });
        const msg = `💰 **PENGAJUAN WITHDRAW** 💰\n\n👤 Pekerja: ${workerName}\n💵 Rp ${currentSaldo.toLocaleString('id-ID')}\n💳 ${paymentData}`;
        fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=-5324239276&text=${encodeURIComponent(msg)}`);
        alert("✔️ Pengajuan pencairan berhasil dikirim!");
    }
};

window.salinNomor = () => {
    const copyText = document.getElementById("target-numbers-display");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("✔️ Nomor berhasil disalin.");
};

window.takeSet = (setKey, setName) => {
    const setTargetRef = dbRef(db, `sets/${setKey}`);
    let retrievedNumbers = []; 
    runTransaction(setTargetRef, (currentData) => {
        if (currentData && currentData.status === "Tersedia") {
            currentData.status = "Dikerjakan";
            currentData.worker = workerName;
            retrievedNumbers = currentData.numbers || []; 
            activeNumbersString = retrievedNumbers.join('\n'); // Simpan nomor untuk format teks nanti
            return currentData;
        }
        return; 
    }).then(({ committed }) => {
        if (committed) {
            activeSetKey = setKey;
            activeSetName = setName;
            startTask(setName, retrievedNumbers); 
        } else alert(`Akses Ditolak: ${setName} telah diambil orang lain.`);
    });
};

function startTask(setName, numbersArray) {
    isWorking = true;
    document.getElementById('request-area').classList.add('hidden');
    document.getElementById('active-task-area').classList.remove('hidden');
    document.getElementById('target-amount-text').innerText = setName;
    document.getElementById('target-numbers-display').value = numbersArray.join('\n'); 
    
    let timer = 20 * 60; 
    const display = document.getElementById('timer-display');
    timerInterval = setInterval(() => {
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (--timer < 0) { clearInterval(timerInterval); batalTask('Waktu Habis'); }
    }, 1000);
}

window.reportIssue = (issueType) => { clearInterval(timerInterval); batalTask(issueType); }

function batalTask(alasan) {
    alert(`Tugas Dibatalkan: ${alasan}`);
    if (activeSetKey) update(dbRef(db, `sets/${activeSetKey}`), { status: "Tersedia", worker: "" });
    resetTampilan();
}

// MENGARAHKAN LANGSUNG KE TELEGRAM ADMIN DENGAN FORMAT PESAN OTOMATIS
window.finishTask = async () => {
    clearInterval(timerInterval);

    // Format teks laporan lengkap
    const formatPesan = `📡 *LAPORAN OPERASIONAL SELESAI* 📡\n\n` +
                          `👤 *Operator:* ${workerName}\n` +
                          `💳 *Metode Pencairan:* ${paymentData}\n` +
                          `🎯 *Sasaran:* ${activeSetName}\n` +
                          `📊 *Daftar Nomor Target:*\n${activeNumbersString}\n\n` +
                          `_(Silakan lampirkan video bukti pengerjaan di bawah pesan ini)_`;

    // Salin teks laporan ke clipboard secara otomatis agar pekerja bisa langsung Paste (Tempel)
    navigator.clipboard.writeText(formatPesan).catch(() => {});

    if (activeSetKey) {
        // Ubah status di database menjadi Menunggu Validasi
        await update(dbRef(db, `sets/${activeSetKey}`), { 
            status: "Menunggu Validasi", 
            video: "Dikirim via Chat Pribadi Telegram" 
        });
    }

    alert("✔️ Data tugas dikunci!\n\nAnda akan diarahkan ke Telegram. Silakan **Tempel (Paste) teks laporan** yang sudah disalin, lalu **kirim video buktinya**.");

    // Buka aplikasi Telegram langsung ke chat Admin dengan membawa teks draf
    const telegramUrl = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=` + encodeURIComponent(formatPesan);
    window.open(telegramUrl, '_blank');

    resetTampilan();
}

function resetTampilan() {
    isWorking = false;
    activeSetKey = null;
    activeSetName = null;
    activeNumbersString = "";
    document.getElementById('request-area').classList.remove('hidden');
    document.getElementById('active-task-area').classList.add('hidden');
    document.getElementById('timer-display').textContent = '20:00';
    document.getElementById('target-numbers-display').value = "";
        }
    
