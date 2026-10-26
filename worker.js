import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref as dbRef, onValue, runTransaction, update, set, push } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

const firebaseConfig = { databaseURL: "https://web-blast-manual-default-rtdb.firebaseio.com/" };
const TELEGRAM_BOT_TOKEN = "8482051630:AAEMjyVO4ufG181ztPo6ErROiYfylYu7oEA"; 
const ADMIN_TELEGRAM_USERNAME = "Licianpoo"; 

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
let activeNumbersString = ""; 
let currentPricePerChat = 0;
let currentSaldo = 0; 
let lastWithdrawTime = 0;
let allSetsData = null;

let kategoriAktif = '1'; 
let textPromo1 = "";
let textPromo2 = "";

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

window.pilihKategori = (kat) => {
    kategoriAktif = kat;
    const btn1 = document.getElementById('tab-1');
    const btn2 = document.getElementById('tab-2');

    if (kat === '1') {
        btn1.className = "flex-1 py-3 glass-btn bg-blue-500/20 text-blue-300 rounded-xl text-xs font-bold border border-blue-500/30 transition";
        btn2.className = "flex-1 py-3 glass-btn bg-white/5 text-white/50 rounded-xl text-xs font-bold border border-transparent transition";
    } else {
        btn2.className = "flex-1 py-3 glass-btn bg-purple-500/20 text-purple-300 rounded-xl text-xs font-bold border border-purple-500/30 transition";
        btn1.className = "flex-1 py-3 glass-btn bg-white/5 text-white/50 rounded-xl text-xs font-bold border border-transparent transition";
    }
    renderWorkspace();
};

function mulaiPantauSistem() {
    const safeKey = workerName.replace(/[.#$[\]]/g, '');

    onValue(dbRef(db, `workers/${safeKey}`), (snapshot) => {
        if (snapshot.exists() && snapshot.val().last_withdraw_time) {
            lastWithdrawTime = snapshot.val().last_withdraw_time;
        }
        if (!isWorking) renderWorkspace(); 
    });

    onValue(configRef, (snapshot) => {
        if (snapshot.exists()) {
            const conf = snapshot.val();
            currentPricePerChat = conf.price_per_chat || 0;
            textPromo1 = conf.text_1 || "Belum ada teks...";
            textPromo2 = conf.text_2 || "Belum ada teks...";
            document.getElementById('info-tarif').innerText = `Rp ${currentPricePerChat.toLocaleString('id-ID')}`;
        }
        if (!isWorking) renderWorkspace();
    });

    onValue(setsRef, (snapshot) => {
        allSetsData = snapshot.exists() ? snapshot.val() : null;
        if (!isWorking) renderWorkspace();
    });

    onValue(withdrawRef, (snapshot) => {
        const withdrawTbody = document.getElementById('withdraw-history-list');
        const withdrawEmpty = document.getElementById('withdraw-empty');
        withdrawTbody.innerHTML = '';
        let hasWithdraw = false;

        if (snapshot.exists()) {
            const wData = snapshot.val();
            const myWithdrawals = Object.keys(wData)
                .map(key => ({ key, ...wData[key] }))
                .filter(w => w.worker === workerName)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (myWithdrawals.length > 0) hasWithdraw = true;

            myWithdrawals.forEach(w => {
                let badge = w.status === "Pending" 
                    ? '<span class="text-yellow-400 text-[10px]">⏳ Pending</span>'
                    : '<span class="text-emerald-400 text-[10px]">✔️ Lunas</span>';
                
                const tr = document.createElement('tr');
                tr.className = "border-b border-white/5";
                tr.innerHTML = `<td class="py-2 px-1 text-white/90">Rp ${w.amount.toLocaleString('id-ID')}</td><td class="py-2 px-1 text-white/50 text-[10px] italic">${w.payment_info.substring(0, 15)}...</td><td class="py-2 px-1 text-right">${badge}</td>`;
                withdrawTbody.appendChild(tr);
            });
        }
        if (hasWithdraw) withdrawEmpty.classList.add('hidden');
        else withdrawEmpty.classList.remove('hidden');
    });
}

function renderWorkspace() {
    const gridSets = document.getElementById('grid-sets');
    const historyTbody = document.getElementById('worker-history-list');
    gridSets.innerHTML = ''; 
    historyTbody.innerHTML = '';
    
    let visibleCount = 0;
    let validNumberCount = 0; 

    if (allSetsData) {
        const allSets = Object.keys(allSetsData).map(key => ({ key, ...allSetsData[key] }));

        const visibleSets = allSets.filter(set => {
            let cat = set.category || '1'; // Default ke kategori 1
            return (set.status === "Tersedia" || set.status === "Dikerjakan") && cat === kategoriAktif;
        }).sort((a, b) => a.id - b.id);
        
        visibleCount = visibleSets.length;
        document.getElementById('info-tersedia').innerText = visibleCount;

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
            let labelKat = (setInfo.category || '1') === '2' ? '[Kat 2]' : '[Kat 1]';

            if (setInfo.status === "Menunggu Validasi") badge = '<span class="text-yellow-400/90 text-[10px]">⏳ Otorisasi</span>';
            else if (setInfo.status === "Valid") {
                badge = '<span class="text-emerald-400 text-[10px]">✔️ Selesai</span>';
                let taskTime = setInfo.completed_at || 0; 
                if (lastWithdrawTime === 0 || taskTime > lastWithdrawTime) {
                    validNumberCount += (setInfo.count || 0); 
                }
            }
            else if (setInfo.status === "Gagal") badge = '<span class="text-rose-400 text-[10px]">❌ Gagal</span>';
            else if (setInfo.status === "Dikerjakan") badge = '<span class="text-blue-400 text-[10px]">🔄 Proses</span>';

            const tr = document.createElement('tr');
            tr.className = "border-b border-white/5";
            tr.innerHTML = `<td class="py-2 px-1 text-white/80">${labelKat} ${setInfo.name}</td><td class="py-2 px-1 text-right">${badge}</td>`;
            historyTbody.appendChild(tr);
        });
    }

    currentSaldo = validNumberCount * currentPricePerChat;
    document.getElementById('display-saldo').innerText = `Rp ${currentSaldo.toLocaleString('id-ID')}`;

    if (visibleCount > 0) { document.getElementById('empty-state').classList.add('hidden'); } 
    else { document.getElementById('empty-state').classList.remove('hidden'); }
}

window.ajukanPencairan = async () => {
    if (currentSaldo <= 0) return alert("Belum ada pendapatan baru yang divalidasi.");
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

window.salinTeksPesan = () => {
    const copyText = document.getElementById("promo-text-display");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    alert("✔️ Teks promosi berhasil disalin.");
};

window.takeSet = (setKey, setName) => {
    const setTargetRef = dbRef(db, `sets/${setKey}`);
    let retrievedNumbers = []; 
    let retrievedCategory = '1';

    runTransaction(setTargetRef, (currentData) => {
        if (currentData && currentData.status === "Tersedia") {
            currentData.status = "Dikerjakan";
            currentData.worker = workerName;
            retrievedNumbers = currentData.numbers || []; 
            activeNumbersString = retrievedNumbers.join('\n'); 
            retrievedCategory = currentData.category || '1';
            return currentData;
        }
        return; 
    }).then(({ committed }) => {
        if (committed) {
            activeSetKey = setKey;
            activeSetName = setName;
            startTask(setName, retrievedNumbers, retrievedCategory); 
        } else alert(`Akses Ditolak: ${setName} telah diambil orang lain.`);
    });
};

function startTask(setName, numbersArray, category) {
    isWorking = true;
    document.getElementById('request-area').classList.add('hidden');
    document.getElementById('active-task-area').classList.remove('hidden');
    document.getElementById('target-amount-text').innerText = setName;
    document.getElementById('target-numbers-display').value = numbersArray.join('\n'); 
    
    if(category === '1') {
        document.getElementById('promo-text-display').value = textPromo1;
    } else {
        document.getElementById('promo-text-display').value = textPromo2;
    }

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

window.finishTask = async () => {
    clearInterval(timerInterval);

    const formatPesan = `📡 *LAPORAN OPERASIONAL SELESAI* 📡\n\n👤 *Operator:* ${workerName}\n💳 *Pencairan:* ${paymentData}\n🎯 *Sasaran:* ${activeSetName}\n📊 *Nomor Target:*\n${activeNumbersString}\n\n_(Silakan lampirkan video bukti pengerjaan di bawah pesan ini)_`;

    navigator.clipboard.writeText(formatPesan).catch(() => {});

    if (activeSetKey) {
        await update(dbRef(db, `sets/${activeSetKey}`), { 
            status: "Menunggu Validasi", 
            video: "Dikirim via Chat Pribadi Telegram",
            completed_at: Date.now() 
        });
    }

    const telegramUrl = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=` + encodeURIComponent(formatPesan);

    if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(telegramUrl);
    } else {
        window.location.href = telegramUrl;
    }
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
    document.getElementById('promo-text-display').value = "";
            }
                
