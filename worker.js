import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref as dbRef, onValue, runTransaction, update, set, push } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

const firebaseConfig = { databaseURL: "https://web-blast-manual-default-rtdb.firebaseio.com/" };
const ADMIN_TELEGRAM_USERNAME = "Licianpoo";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const setsRef = dbRef(db, 'sets');
const configRef = dbRef(db, 'config');
const withdrawRef = dbRef(db, 'withdrawals');

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
let nameKat1 = "Kategori 1";
let nameKat2 = "Kategori 2";

window.onload = () => {
    workerName = localStorage.getItem('wa_worker_name') || "";
    paymentData = localStorage.getItem('wa_payment_info') || "";
    
    const inputNama = document.getElementById('input-nama');
    const inputPayment = document.getElementById('input-payment');
    if (inputNama) inputNama.value = workerName;
    if (inputPayment) inputPayment.value = paymentData;

    if (workerName && paymentData) masukKeWorkspace();
};

window.simpanDataPekerja = () => {
    const inputNama = document.getElementById('input-nama');
    const inputPayment = document.getElementById('input-payment');
    
    workerName = inputNama ? inputNama.value.trim() : "";
    paymentData = inputPayment ? inputPayment.value.trim() : "";
    
    if (!workerName) return alert("Nama tidak boleh kosong.");
    if (!paymentData) return alert("Metode pencairan wajib diisi.");
    
    localStorage.setItem('wa_worker_name', workerName);
    localStorage.setItem('wa_payment_info', paymentData);

    const safeKey = workerName.replace(/[.#$[\]]/g, ''); 
    set(dbRef(db, `workers/${safeKey}`), {
        nama: workerName,
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
    const displayNama = document.getElementById('display-nama');
    const panelLogin = document.getElementById('panel-login');
    const panelWorkspace = document.getElementById('panel-workspace');
    
    if (displayNama) displayNama.innerText = workerName;
    if (panelLogin) panelLogin.classList.add('hidden');
    if (panelWorkspace) panelWorkspace.classList.remove('hidden');
    
    mulaiPantauSistem();
}

window.pilihKategori = (kat) => {
    kategoriAktif = kat;
    const btn1 = document.getElementById('tab-1');
    const btn2 = document.getElementById('tab-2');

    if (kat === '1') {
        if (btn1) btn1.className = "flex-1 py-3 glass-btn bg-blue-500/20 text-blue-300 rounded-xl text-xs font-bold border border-blue-500/30 transition";
        if (btn2) btn2.className = "flex-1 py-3 glass-btn bg-white/5 text-white/50 rounded-xl text-xs font-bold border border-transparent transition";
    } else {
        if (btn2) btn2.className = "flex-1 py-3 glass-btn bg-purple-500/20 text-purple-300 rounded-xl text-xs font-bold border border-purple-500/30 transition";
        if (btn1) btn1.className = "flex-1 py-3 glass-btn bg-white/5 text-white/50 rounded-xl text-xs font-bold border border-transparent transition";
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
            nameKat1 = conf.name_kat1 || "Kategori 1";
            nameKat2 = conf.name_kat2 || "Kategori 2";
            
            const infoTarif = document.getElementById('info-tarif');
            if (infoTarif) infoTarif.innerText = `Rp ${currentPricePerChat.toLocaleString('id-ID')}`;
            
            const tab1 = document.getElementById('tab-1');
            const tab2 = document.getElementById('tab-2');
            if (tab1) tab1.innerText = nameKat1;
            if (tab2) tab2.innerText = nameKat2;
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
        if (!withdrawTbody) return;
        
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
        if (withdrawEmpty) {
            if (hasWithdraw) withdrawEmpty.classList.add('hidden');
            else withdrawEmpty.classList.remove('hidden');
        }
    });
}

function renderWorkspace() {
    const gridSets = document.getElementById('grid-sets');
    const historyTbody = document.getElementById('worker-history-list');
    if (!gridSets || !historyTbody) return;
    
    gridSets.innerHTML = ''; 
    historyTbody.innerHTML = '';
    
    let visibleCount = 0;
    let validNumberCount = 0; 

    if (allSetsData) {
        const allSets = Object.keys(allSetsData).map(key => ({ key, ...allSetsData[key] }));

        const visibleSets = allSets.filter(set => {
            let cat = set.category || '1'; 
            return (set.status === "Tersedia" || set.status === "Dikerjakan") && cat === kategoriAktif;
        }).sort((a, b) => a.id - b.id);
        
        visibleCount = visibleSets.length;
        
        const infoTersedia = document.getElementById('info-tersedia');
        if (infoTersedia) infoTersedia.innerText = visibleCount;

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
            let labelKat = (setInfo.category || '1') === '2' ? `[${nameKat2}]` : `[${nameKat1}]`;

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
    const displaySaldo = document.getElementById('display-saldo');
    if (displaySaldo) displaySaldo.innerText = `Rp ${currentSaldo.toLocaleString('id-ID')}`;

    const emptyState = document.getElementById('empty-state');
    if (emptyState) {
        if (visibleCount > 0) emptyState.classList.add('hidden');
        else emptyState.classList.remove('hidden');
    }
}

window.ajukanPencairan = async () => {
    if (currentSaldo <= 0) return alert("Belum ada pendapatan baru yang divalidasi.");
    if (confirm(`Cairkan Rp ${currentSaldo.toLocaleString('id-ID')} ke:\n${paymentData}?`)) {
        await set(push(withdrawRef), { worker: workerName, payment_info: paymentData, amount: currentSaldo, timestamp: Date.now(), status: "Pending" });
        alert("✔️ Pengajuan pencairan berhasil dikirim ke Admin!");
    }
};

window.salinNomor = () => {
    const copyText = document.getElementById("target-numbers-display");
    if (copyText) {
        copyText.select();
        navigator.clipboard.writeText(copyText.value);
        alert("✔️ Nomor berhasil disalin.");
    }
};

window.salinTeksPesan = () => {
    const copyText = document.getElementById("promo-text-display");
    if (copyText) {
        copyText.select();
        navigator.clipboard.writeText(copyText.value);
        alert("✔️ Teks promosi berhasil disalin.");
    }
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
    const reqArea = document.getElementById('request-area');
    const actArea = document.getElementById('active-task-area');
    const targetText = document.getElementById('target-amount-text');
    const targetDisplay = document.getElementById('target-numbers-display');
    const promoDisplay = document.getElementById('promo-text-display');

    if (reqArea) reqArea.classList.add('hidden');
    if (actArea) actArea.classList.remove('hidden');
    if (targetText) targetText.innerText = setName;
    if (targetDisplay) targetDisplay.value = numbersArray.join('\n'); 
    
    if (promoDisplay) {
        if (category === '1') promoDisplay.value = textPromo1;
        else promoDisplay.value = textPromo2;
    }

    let timer = 20 * 60; 
    const display = document.getElementById('timer-display');
    timerInterval = setInterval(() => {
        let minutes = parseInt(timer / 60, 10);
        let seconds = parseInt(timer % 60, 10);
        if (display) display.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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

    const formatPesan = `📡 *LAPORAN OPERASIONAL SELESAI* 📡\n\n` +
                          `👤 *Operator:* ${workerName}\n` +
                          `💳 *Pencairan:* ${paymentData}\n` +
                          `🎯 *Sasaran:* ${activeSetName}\n` +
                          `📊 *Nomor Target:*\n${activeNumbersString}\n\n` +
                          `_(Silakan lampirkan video bukti pengerjaan di bawah pesan ini)_`;

    navigator.clipboard.writeText(formatPesan).catch(() => {});

    if (activeSetKey) {
        await update(dbRef(db, `sets/${activeSetKey}`), { 
            status: "Menunggu Validasi", 
            video: "Dikirim via Chat Pribadi Telegram",
            completed_at: Date.now() 
        });
    }

    const telegramUrl = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=` + encodeURIComponent(formatPesan);
    window.location.href = telegramUrl;

    resetTampilan();
}

function resetTampilan() {
    isWorking = false;
    activeSetKey = null;
    activeSetName = null;
    activeNumbersString = "";
    
    const reqArea = document.getElementById('request-area');
    const actArea = document.getElementById('active-task-area');
    const timerDisplay = document.getElementById('timer-display');
    const targetDisplay = document.getElementById('target-numbers-display');
    const promoDisplay = document.getElementById('promo-text-display');

    if (reqArea) reqArea.classList.remove('hidden');
    if (actArea) actArea.classList.add('hidden');
    if (timerDisplay) timerDisplay.textContent = '20:00';
    if (targetDisplay) targetDisplay.value = "";
    if (promoDisplay) promoDisplay.value = "";
                }
        
