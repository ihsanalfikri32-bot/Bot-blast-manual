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
    const bottomNav = document.getElementById('bottom-nav');
    
    if (displayNama) displayNama.innerText = workerName;
    if (panelLogin) panelLogin.classList.add('hidden');
    if (panelWorkspace) panelWorkspace.classList.remove('hidden');
    if (bottomNav) bottomNav.classList.remove('hidden'); // Munculkan nav bar bawah
    
    mulaiPantauSistem();
}

// STYLING TAB TERANG/GELAP DI JS
window.pilihKategori = (kat) => {
    kategoriAktif = kat;
    const btn1 = document.getElementById('tab-1');
    const btn2 = document.getElementById('tab-2');

    const activeClass = "flex-1 py-2.5 bg-white dark:bg-gray-800 shadow-sm text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold transition-all";
    const inactiveClass = "flex-1 py-2.5 text-gray-500 dark:text-gray-400 rounded-lg text-xs font-bold transition-all hover:bg-white/50 dark:hover:bg-gray-800/50";

    if (kat === '1') {
        if (btn1) btn1.className = activeClass;
        if (btn2) btn2.className = inactiveClass;
    } else {
        if (btn2) btn2.className = activeClass;
        if (btn1) btn1.className = inactiveClass;
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
                    ? '<span class="text-yellow-600 dark:text-yellow-400 font-bold"><i class="fa-solid fa-clock"></i> Pend</span>'
                    : '<span class="text-emerald-600 dark:text-emerald-400 font-bold"><i class="fa-solid fa-check-circle"></i> Lunas</span>';
                
                const tr = document.createElement('tr');
                tr.className = "border-b border-gray-200/50 dark:border-white/5";
                tr.innerHTML = `<td class="py-3 px-2 font-bold text-sm">Rp ${w.amount.toLocaleString('id-ID')}</td><td class="py-3 px-2 text-[10px] font-medium opacity-60">${w.payment_info.substring(0, 15)}...</td><td class="py-3 px-2 text-right text-[10px]">${badge}</td>`;
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

        visibleSets.forEach(setInfo => {
            const btn = document.createElement('button');
            if (setInfo.status === "Tersedia") {
                btn.className = "glass-btn bg-white/40 dark:bg-white/5 py-4 px-4 rounded-2xl flex flex-col items-start gap-1 group text-left border border-white/40 hover:border-blue-500/50 hover:shadow-lg transition-all";
                btn.innerHTML = `<span class="text-[9px] opacity-60 font-bold uppercase tracking-wider"><i class="fa-solid fa-crosshairs"></i> Target</span><span class="text-sm font-bold text-blue-600 dark:text-blue-300 mt-1">${setInfo.name}</span><span class="text-[10px] bg-blue-100 dark:bg-white/10 px-2 py-1 rounded-md text-blue-700 dark:text-white/70 font-medium mt-1"><i class="fa-solid fa-users"></i> ${setInfo.count} Nomor</span>`;
                btn.onclick = () => takeSet(setInfo.key, setInfo.name);
            } else {
                btn.className = "glass-btn bg-gray-200/50 dark:bg-black/40 py-4 px-4 rounded-2xl flex flex-col items-start gap-1 text-left opacity-60 cursor-not-allowed border border-transparent";
                btn.disabled = true;
                btn.innerHTML = `<span class="text-[9px] text-red-500 uppercase tracking-wider font-bold"><i class="fa-solid fa-lock"></i> Diproses</span><span class="text-sm font-bold opacity-50 line-through mt-1">${setInfo.name}</span>`;
            }
            gridSets.appendChild(btn);
        });

        const myHistorySets = allSets.filter(set => set.worker === workerName && set.status !== "Tersedia").sort((a, b) => b.id - a.id); 
        
        myHistorySets.forEach(setInfo => {
            let badge = '';
            let labelKat = (setInfo.category || '1') === '2' ? `[${nameKat2}]` : `[${nameKat1}]`;

            if (setInfo.status === "Menunggu Validasi") badge = '<span class="text-yellow-600 dark:text-yellow-400 font-bold text-[10px]"><i class="fa-solid fa-hourglass-half"></i> Otorisasi</span>';
            else if (setInfo.status === "Valid") {
                badge = '<span class="text-emerald-600 dark:text-emerald-400 font-bold text-[10px]"><i class="fa-solid fa-check"></i> Selesai</span>';
                let taskTime = setInfo.completed_at || 0; 
                if (lastWithdrawTime === 0 || taskTime > lastWithdrawTime) {
                    let jumlahTerkirim = setInfo.completed_count !== undefined ? setInfo.completed_count : (setInfo.count || 0);
                    validNumberCount += jumlahTerkirim; 
                }
            }
            else if (setInfo.status === "Gagal") badge = '<span class="text-red-600 dark:text-red-400 font-bold text-[10px]"><i class="fa-solid fa-xmark"></i> Gagal</span>';
            else if (setInfo.status === "Dikerjakan") badge = '<span class="text-blue-600 dark:text-blue-400 font-bold text-[10px]"><i class="fa-solid fa-spinner fa-spin"></i> Proses</span>';

            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-200/50 dark:border-white/5";
            tr.innerHTML = `<td class="py-3 px-2 font-medium">${labelKat} ${setInfo.name} <br><span class="text-[9px] opacity-60">(${setInfo.completed_count !== undefined ? setInfo.completed_count : setInfo.count} Target)</span></td><td class="py-3 px-2 text-right">${badge}</td>`;
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

window.finishTask = () => prosesPenyelesaian('Selesai');
window.reportIssue = (issueType) => prosesPenyelesaian(issueType);

async function prosesPenyelesaian(tipeLaporan) {
    const allNumbersArray = activeNumbersString.split('\n').filter(n => n.trim() !== '');
    const totalNomor = allNumbersArray.length;

    let inputJumlah = prompt(`Dari total ${totalNomor} nomor, berapa nomor yang BERHASIL Anda kirim?`, totalNomor);
    if (inputJumlah === null) return; 
    clearInterval(timerInterval); 

    let sentCount = parseInt(inputJumlah);
    if (isNaN(sentCount) || sentCount < 0) sentCount = 0;
    if (sentCount > totalNomor) sentCount = totalNomor;

    const completedNumbers = allNumbersArray.slice(0, sentCount);
    const remainingNumbers = allNumbersArray.slice(sentCount);

    if (remainingNumbers.length > 0) {
        const newSetId = Date.now();
        await set(dbRef(db, `sets/Gugus_Sisa_${newSetId}`), {
            id: newSetId,
            name: `Gugus Tugas (Sisa ${remainingNumbers.length})`,
            count: remainingNumbers.length,
            numbers: remainingNumbers,
            category: kategoriAktif,
            status: "Tersedia",
            worker: "",
            video: ""
        });
    }

    if (activeSetKey) {
        await update(dbRef(db, `sets/${activeSetKey}`), { 
            status: "Menunggu Validasi", 
            count: sentCount,
            completed_count: sentCount,
            numbers: completedNumbers,
            video: `Laporan ${tipeLaporan} (${sentCount}/${totalNomor} Terkirim)`, 
            completed_at: Date.now() 
        });
    }

    const formatPesan = `📡 *LAPORAN OPERASIONAL (${tipeLaporan.toUpperCase()})* 📡\n\n` +
                          `👤 *Operator:* ${workerName}\n` +
                          `💳 *Pencairan:* ${paymentData}\n` +
                          `🎯 *Sasaran:* ${activeSetName}\n` +
                          `📊 *Status:* Terkirim ${sentCount} dari ${totalNomor} nomor\n\n` +
                          `📋 *Nomor Berhasil Terkirim:*\n${completedNumbers.join('\n')}\n\n` +
                          `_(Silakan lampirkan video bukti pengerjaan di bawah pesan ini)_`;

    navigator.clipboard.writeText(formatPesan).catch(() => {});
    const telegramUrl = `https://t.me/${ADMIN_TELEGRAM_USERNAME}?text=` + encodeURIComponent(formatPesan);
    window.location.href = telegramUrl;
    resetTampilan();
}

function batalTask(alasan) {
    alert(`Tugas Dibatalkan: ${alasan}`);
    if (activeSetKey) update(dbRef(db, `sets/${activeSetKey}`), { status: "Tersedia", worker: "" });
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
